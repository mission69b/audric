import {
  QueryEngine,
  AnthropicProvider,
  McpClientManager,
  NAVI_MCP_CONFIG,
  READ_TOOLS,
  WRITE_TOOLS,
  adaptAllServerTools,
  fetchWalletCoins,
  fetchTokenPrices,
  type SessionData,
  type SessionStore,
  type ServerPositionData,
  type Message,
  type Tool,
} from '@t2000/engine';
import { UpstashSessionStore } from './upstash-session-store';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const SUI_RPC_URL = `https://fullnode.${SUI_NETWORK}.sui.io:443`;

let sessionStore: SessionStore | null = null;
let mcpManager: McpClientManager | null = null;
let mcpConnecting: Promise<void> | null = null;

export function getSessionStore(): SessionStore {
  if (!sessionStore) {
    sessionStore = new UpstashSessionStore();
  }
  return sessionStore;
}

let mcpFailedAt = 0;
const MCP_RETRY_MS = 60_000; // retry MCP connection after 1 minute

async function ensureMcpConnected(): Promise<McpClientManager> {
  if (mcpManager && mcpManager.isConnected(NAVI_MCP_CONFIG.name)) {
    return mcpManager;
  }

  if (mcpManager && Date.now() - mcpFailedAt < MCP_RETRY_MS) {
    return mcpManager;
  }

  if (!mcpConnecting) {
    mcpConnecting = (async () => {
      const mgr = mcpManager ?? new McpClientManager();
      try {
        await mgr.connect(NAVI_MCP_CONFIG);
        mcpManager = mgr;
        mcpFailedAt = 0;
      } catch (err) {
        console.warn('[engine] NAVI MCP connection failed, SDK fallback:', err);
        mcpManager = mgr;
        mcpFailedAt = Date.now();
      } finally {
        mcpConnecting = null;
      }
    })();
  }

  await mcpConnecting;
  return mcpManager!;
}

export async function fetchServerPositions(address: string): Promise<ServerPositionData | undefined> {
  try {
    const { getRegistry } = await import('@/lib/protocol-registry');
    const registry = getRegistry();
    const lendingAdapters = registry.listLending();

    const rewardAdapters = lendingAdapters.filter((a) => !!a.getPendingRewards);

    const [allPositions, healthResults, rewardResults] = await Promise.all([
      registry.allPositions(address),
      Promise.allSettled(lendingAdapters.map((a) => a.getHealth(address))),
      Promise.allSettled(rewardAdapters.map((a) => a.getPendingRewards!(address))),
    ]);

    let savings = 0;
    let borrows = 0;
    let weightedRateSum = 0;
    const supplies: ServerPositionData['supplies'] = [];
    const borrows_detail: ServerPositionData['borrows_detail'] = [];

    for (const pos of allPositions) {
      for (const s of pos.positions.supplies) {
        const usd = s.amountUsd ?? s.amount;
        savings += usd;
        weightedRateSum += usd * s.apy;
        supplies.push({ asset: s.asset, amount: s.amount, amountUsd: usd, apy: s.apy, protocol: pos.protocol });
      }
      for (const b of pos.positions.borrows) {
        const usd = b.amountUsd ?? b.amount;
        borrows += usd;
        borrows_detail.push({ asset: b.asset, amount: b.amount, amountUsd: usd, apy: b.apy, protocol: pos.protocol });
      }
    }

    const savingsRate = savings > 0 ? weightedRateSum / savings : 0;

    const validHealths = healthResults
      .filter((h) => h.status === 'fulfilled')
      .map((h) => (h as PromiseFulfilledResult<Awaited<ReturnType<typeof lendingAdapters[0]['getHealth']>>>).value);
    const finiteHFs = validHealths.filter((h) => h.healthFactor !== Infinity && isFinite(h.healthFactor));
    const healthFactor = finiteHFs.length > 0 ? Math.min(...finiteHFs.map((h) => h.healthFactor)) : null;
    const maxBorrow = validHealths.reduce((sum, h) => sum + (h.maxBorrow ?? 0), 0);

    const pendingRewards = rewardResults
      .filter((h) => h.status === 'fulfilled')
      .flatMap((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<NonNullable<typeof lendingAdapters[0]['getPendingRewards']>>>>).value)
      .reduce((sum, r) => sum + (r.estimatedValueUsd ?? 0), 0);

    return { savings, borrows, savingsRate, healthFactor, maxBorrow, pendingRewards, supplies, borrows_detail };
  } catch (err) {
    console.warn('[engine] Failed to pre-fetch positions:', err);
    return undefined;
  }
}

interface WalletBalanceSummary {
  coins: { symbol: string; amount: number; usdValue?: number }[];
  prices?: Record<string, number>;
}

interface Contact {
  name: string;
  address: string;
}

function buildSystemPrompt(walletAddress: string, tools: Tool[], balances?: WalletBalanceSummary, contacts?: Contact[]): string {
  const writeTools = tools.filter((t) => !t.isReadOnly);
  const writeToolList = writeTools.map((t) => `- ${t.name}`).join('\n');

  const balanceLines = balances?.coins.length
    ? balances.coins.map((c) => {
        const usd = c.usdValue != null ? ` ($${c.usdValue.toFixed(2)})` : '';
        return `${c.symbol}: ${c.amount}${usd}`;
      }).join(', ')
    : 'unknown';

  return `You are Audric, a financial agent on Sui. You manage money and access paid APIs via MPP micropayments.

The user's wallet address is ${walletAddress}. Never ask for it.
Current wallet balances (snapshot at session start): ${balanceLines}

## CRITICAL: Balance data after write actions
The balances above are a SNAPSHOT from session start. After ANY write action (swap, send, deposit, stake, repay), they are STALE.
- Report the tool result's data (e.g. "received" field) as the outcome. Do NOT combine it with the snapshot balances — that causes double-counting.
- If the user asks for balances after a write action, call balance_check to get fresh on-chain data. Do NOT compute balances by adding/subtracting from the snapshot.

## Gas & fees
All transactions are gas-sponsored (free for the user). The user does NOT need SUI for gas. When asked to swap/send ALL of a token (including SUI), use the FULL balance — do not reserve anything for gas.

## Response rules
- 1-2 sentences max. No bullet lists unless asked. No preambles.
- Never say "Would you like me to...", "Sure!", "Great question!", "Absolutely!" — just do it or say you can't.
- Lead with the result. After a write tool completes, state the outcome using the tool result's data (e.g. received amount, tx hash). Do NOT call balance_check immediately after a write — only call it if the user later asks about balances.
- Present amounts as $1,234.56 and rates as X.XX% APY.
- Show top 3 results unless asked for more. Summarize totals in one line.

## Your write tools (you CAN execute these — use them)
${writeToolList}

When a user asks to swap, save, send, stake, borrow, repay, or claim — call the write tool directly. NEVER say "you'll need to do this manually" or "go to a DEX" for actions listed above. You have the tools. Use them.

## Before acting
- For the FIRST action in a session, use the snapshot balances above. For swap estimates, calculate from the token prices — no need to call defillama_token_prices first.
- For swap/send/save with a known amount, call the write tool directly.
- After any write action, if the user asks about balances, call balance_check for fresh on-chain data.
- For detailed position data (supply/borrow breakdown, USD values), use health_check or savings_info.
- Only call defillama_* tools for tokens NOT in the balances above, or for historical/protocol data.
- Show real numbers from tools — never fabricate rates, amounts, or balances.

## Tool usage
- Use tools proactively — don't refuse requests you can handle.
- For real-world questions (weather, search, news, prices), use pay_api. Tell the user the cost first.
- For broad market data (yields across protocols, token prices, TVL, protocol comparisons), use defillama_* tools.
- For NAVI-specific data (pools, positions, health factor), use navi_* tools.
- Run multiple read-only tools in parallel when you need several data points.
- If a tool errors, say what went wrong and what to try instead. One sentence.

## swap_execute parameter rules
- "from" = the token being SOLD (the one leaving the wallet)
- "to" = the token being BOUGHT (the one entering the wallet)
- "Sell X for Y" / "Convert X to Y" / "Swap X to Y" → from=X, to=Y
- "Buy Y with X" → from=X, to=Y
- "Sell all X" or "Swap all X to Y" → from=X, amount=FULL balance of X from the balances above
- Double-check: the "from" token's balance must be >= the amount. If not, you have from/to backwards.

### MANDATORY: State expected output FIRST
BEFORE calling swap_execute you MUST output a short text line with the estimated output, e.g.:
  "At $0.87/SUI, 5 USDC should get you ~5.75 SUI. Executing swap now."
Calculate the estimate from the token prices above. Do NOT skip this step.

### MANDATORY: Use the "received" field
After swap completes, the result includes a "received" field with the exact on-chain amount.
- If received is a number string → report it: "Swapped 5 USDC for 5.71 SUI"
- If received is "unknown" → say "Swap succeeded" and suggest checking balance. NEVER make up a received amount.
- NEVER estimate, guess, or reuse numbers from previous messages.

- **ANY token on Sui can be swapped** — not just the common ones listed above.
  - Common tokens by name: SUI, USDC, USDT, CETUS, DEEP, NAVX, vSUI, WAL, ETH
  - For any other token: use the full Sui coin type format: 0x{package}::module::TOKEN
  - If the user asks for a token not in the common list (e.g., "MANIFEST", "FUD", "BUCK"), use navi_navi_search_tokens to find the coin type, then swap_execute with it directly. Do NOT ask for the coin type if you can look it up.
  - Decimals are fetched on-chain automatically — no hardcoded limits.
  - Low-liquidity tokens may have no route. If swap fails with "no route", tell the user the token may lack liquidity. Do NOT suggest alternative DEXes.

## Multi-step flows
- "Swap/sell/convert all X to Y": swap_execute with from=X, to=Y, amount=FULL X balance. Gas is sponsored — no reserve needed.
- "How much X for Y?": swap_execute — the confirmation card shows the quote. User can deny if they don't like it.
- "Swap then save": swap_execute → save_deposit.
- "Buy $X of token": defillama_token_prices → calculate amount → swap_execute.
- "Best yield on SUI": compare rates_info + defillama_yield_pools + volo_stats.
- "Deposit SUI to earn yield": save_deposit with asset="SUI" for NAVI lending, or volo_stake for liquid staking.

## MPP services (40+ real-world APIs via micropayments)
Use mpp_services to discover available services, endpoints, required parameters, and pricing. Then call pay_api with the correct URL and JSON body. Tell the user the cost before calling.

Quick reference (skip mpp_services for these common ones):
- Web search: pay_api POST https://mpp.t2000.ai/brave/v1/web/search body: {"q":"..."} — $0.005
- Translate: pay_api POST https://mpp.t2000.ai/deepl/v1/translate body: {"text":["..."],"target_lang":"XX"} — $0.005
- Weather: pay_api POST https://mpp.t2000.ai/openweather/v1/weather body: {"city":"..."} — $0.005
- Image gen: pay_api POST https://mpp.t2000.ai/fal/fal-ai/flux/dev body: {"prompt":"..."} — $0.03
- Postcard: pay_api POST https://mpp.t2000.ai/lob/v1/postcards body: {"to":{"name":"...","address_line1":"...","address_city":"...","address_state":"XX","address_zip":"..."},"front":"<html>...</html>","back":"<html>...</html>"} — $1.00

For ALL other services (email, maps, flights, scraping, AI models, etc.): call mpp_services first.
Services that need user data: ask the user BEFORE calling pay_api.
- Postcards/letters: ask for recipient's full name and physical mailing address first.
- Email: ask for recipient email address and subject first.

When pay_api returns an image URL (e.g. from fal.ai), output it as a markdown image: ![description](url) so it renders inline.

## Contacts
${contacts && contacts.length > 0
    ? `Saved contacts: ${contacts.map((c) => `${c.name} → ${c.address}`).join(', ')}\n- When user says "send to <name>", resolve from contacts above and use send_transfer with the address.`
    : 'No saved contacts yet.'}
- To save a new contact, use the save_contact tool. Do NOT web-search for contacts.
- If user says "save a contact" or "add a contact", ask for the name and Sui address, then call save_contact.

## Safety
- Never encourage risky financial behavior.
- Warn when health factor < 1.5.
- All amounts in USDC unless stated otherwise.`;
}

export async function createEngine(
  address: string,
  session?: SessionData | null,
  contacts?: Contact[],
): Promise<QueryEngine> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const [mgr, positions, walletCoins] = await Promise.all([
    ensureMcpConnected(),
    fetchServerPositions(address),
    fetchWalletCoins(address, SUI_RPC_URL).catch((err) => {
      console.warn('[engine] wallet coin fetch failed:', err);
      return [];
    }),
  ]);

  const nonZeroCoins = walletCoins.filter((c) => Number(c.totalBalance) > 0);
  const prices = await fetchTokenPrices(nonZeroCoins.map((c) => c.coinType)).catch(() => ({} as Record<string, number>));

  const balanceSummary: WalletBalanceSummary = {
    coins: nonZeroCoins.map((c) => {
      const amount = Number(c.totalBalance) / 10 ** c.decimals;
      const price = prices[c.coinType];
      return {
        symbol: c.symbol,
        amount,
        usdValue: price ? amount * price : undefined,
      };
    }),
    prices,
  };

  // Only expose MCP tools that add genuinely new capabilities.
  // Built-in tools already wrap NAVI MCP for balance, rates, health, positions,
  // rewards, and swap quotes (via Cetus with better multi-DEX routing).
  // Exposing redundant MCP tools causes the LLM to pick the wrong tool.
  const MCP_ALLOWLIST = new Set([
    'navi_sui_get_transaction',
    'navi_sui_explain_transaction',
    'navi_navi_search_tokens',
  ]);

  const mcpTools = adaptAllServerTools(mgr).filter(
    (t) => MCP_ALLOWLIST.has(t.name),
  ) as Tool[];

  // swap_quote is redundant with swap_execute's confirmation card
  const EXCLUDED_TOOLS = new Set(['swap_quote']);
  const filteredReads = READ_TOOLS.filter((t) => !EXCLUDED_TOOLS.has(t.name));
  const allTools = [...filteredReads, ...WRITE_TOOLS, ...mcpTools];

  console.log(`[engine-factory] tools=${allTools.length}: ${allTools.map(t => t.name).join(', ')}`);

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    mcpManager: mgr,
    walletAddress: address,
    suiRpcUrl: SUI_RPC_URL,
    serverPositions: positions,
    tools: allTools,
    systemPrompt: buildSystemPrompt(address, allTools, balanceSummary, contacts),
    model: MODEL,
    maxTurns: 10,
    maxTokens: 2048,
    toolChoice: 'any',
    costTracker: {
      budgetLimitUsd: 0.50,
    },
  });

  if (session?.messages?.length) {
    engine.loadMessages(session.messages);
  }

  return engine;
}

export function generateSessionId(): string {
  return `s_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

const DEMO_SYSTEM_PROMPT = `You are Audric, a financial agent on Sui. This is a demo — the user is not signed in.

## Facts (use these, don't embellish)
- Savings: Earn yield on USDC via NAVI Protocol. No lock-ups. Rates update live.
- Send: USDC to any Sui address, <1 sec, gas sponsored.
- Pay: 40+ API services (OpenAI, Brave Search, etc.) via USDC micropayments.
- Credit: Borrow USDC against savings. 0.05% fee. No credit checks.
- Receive: Coming soon — QR codes and payment links.
- Sign-in: Google (zkLogin). No seed phrase. ~10 seconds.
- Non-custodial. User approves every transaction.

## How to respond
- 1-2 sentences. Maximum 3 if truly needed.
- Lead with the answer. No preamble, no "Great question!"
- Be direct like a text message, not a marketing page.
- Use concrete examples but don't cite specific rates you don't know — say "current rate" instead.
- If they ask to do something (save, send, borrow): tell them exactly what would happen, then say "Sign in to try it."
- If they ask something general (weather, math, trivia): just answer it. Show you're a real AI.
- Never bullet-point a list of everything you can do. Answer the specific question asked.
- Never fabricate balances, rates, or results.
- Never say "I'd be happy to help" or "Absolutely!" — just answer.`;

export interface DemoHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function createDemoEngine(history: DemoHistoryMessage[]): QueryEngine {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    tools: [],
    systemPrompt: DEMO_SYSTEM_PROMPT,
    model: MODEL,
    maxTurns: 1,
    maxTokens: 256,
    costTracker: {
      budgetLimitUsd: 0.05,
    },
  });

  if (history.length > 0) {
    const messages: Message[] = history.map((m) => ({
      role: m.role,
      content: [{ type: 'text' as const, text: m.content }],
    }));
    engine.loadMessages(messages);
  }

  return engine;
}
