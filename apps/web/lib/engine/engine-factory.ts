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
import { GOAL_TOOLS } from './goal-tools';
import { ADVICE_TOOLS } from './advice-tool';
import { prisma } from '@/lib/prisma';

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

interface GoalSummary {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  deadline: string | null;
  status: string;
}

async function buildAdviceContext(userId: string): Promise<string> {
  try {
    const recentAdvice = await prisma.adviceLog.findMany({
      where: {
        userId,
        outcomeStatus: { in: ['pending', 'on_track', 'off_track'] },
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { goal: true },
    });

    if (recentAdvice.length === 0) return '';

    const lines = recentAdvice.map((a) => {
      const daysAgo = Math.round((Date.now() - a.createdAt.getTime()) / 86_400_000);
      const acted = a.actionTaken ? 'acted on' : 'not yet acted on';
      const goalNote = a.goal ? ` (toward ${a.goal.name})` : '';
      return `- ${daysAgo}d ago: ${a.adviceText}${goalNote} — ${acted}`;
    });

    return [
      'Your recent advice to this user:',
      ...lines,
      'Reference this context naturally when relevant. If the user asks what you suggested, draw from this list.',
    ].join('\n');
  } catch (err) {
    console.warn('[engine] buildAdviceContext failed:', err);
    return '';
  }
}

function buildSystemPrompt(walletAddress: string, tools: Tool[], balances?: WalletBalanceSummary, contacts?: Contact[], swapTokenNames?: string[], goals?: GoalSummary[], adviceContext?: string): string {
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
- After a write tool completes, state the outcome in ONE short sentence (e.g. "Deposited 20 USDC at 4.99% APY."). Do NOT repeat the transaction hash, wallet address, or any data already shown in the receipt card — the UI handles that. Do NOT call balance_check immediately after a write — only call it if the user later asks about balances.
- Present amounts as $1,234.56 and rates as X.XX% APY.
- Show top 3 results unless asked for more. Summarize totals in one line.
- When suggesting saving idle USDC, use the current USDC deposit rate from rates_info (NOT the blended rate of existing positions). The blended rate can be much lower if there are small positions in low-yield assets.

## Your write tools (you CAN execute these — use them)
${writeToolList}

When a user asks to swap, save, send, stake, borrow, repay, or claim — call the write tool directly. NEVER say "you'll need to do this manually" or "go to a DEX" for actions listed above. You have the tools. Use them.

## Before acting — BALANCE VALIDATION (MANDATORY, NEVER SKIP)
- For the FIRST action in a session, use the snapshot balances above.
- After ANY write action completes, the snapshot is STALE. If the user requests ANOTHER write action, call balance_check FIRST to get fresh data before proceeding.
- BEFORE calling ANY write tool (save_deposit, withdraw, send_transfer, swap_execute, borrow, repay_debt, volo_stake, volo_unstake):
  1. ALWAYS check the snapshot (or call balance_check if stale) to verify the user has enough. For save/send/swap: check wallet balance of that token. For withdraw: check savings positions. For repay: check wallet USDC.
  2. If the requested amount EXCEEDS the available balance, REFUSE immediately — do NOT call the write tool. State the exact available balance and ask the user to confirm a lower amount. Example: "You only have 0.97 USDC. Want me to send all 0.97?"
  3. NEVER pass an amount larger than the available balance to a write tool. This applies equally to send_transfer, save_deposit, swap_execute, and all other write tools. Violating this rule causes silent failures or incorrect receipts.
- For swap estimates, calculate from the token prices — no need to call defillama_token_prices first.
- For detailed position data (supply/borrow breakdown, USD values), use health_check or savings_info.
- Only call defillama_* tools for tokens NOT in the balances above, or for historical/protocol data.
- Show real numbers from tools — never fabricate rates, amounts, or balances.

## Tool usage
- Use tools proactively — don't refuse requests you can handle.
- For web search / news / current info, use web_search (free). Only use pay_api for search if web_search is unavailable.
- For weather, translation, image gen, postcards, email, and other real-world services, use pay_api. Tell the user the cost first.
- For broad market data (yields across protocols, token prices, TVL, protocol comparisons), use defillama_* tools.
- For NAVI-specific data (pools, positions, health factor), use navi_* tools.
- For portfolio overview with risk insights, use portfolio_analysis.
- For protocol safety/audit info, use protocol_deep_dive.
- For explaining a transaction, use explain_tx.
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
  - Supported tokens (swap_execute resolves these by name — NO search needed): ${swapTokenNames?.join(', ') ?? 'SUI, USDC, USDT'}
  - For tokens NOT in this list, use navi_navi_search_tokens to find the coin type FIRST, then pass it to swap_execute. Do NOT call swap_execute until you have the coin type.
  - NEVER call both navi_navi_search_tokens and swap_execute in the same turn. Search first → get result → then swap.
  - For tokens in the supported list above, call swap_execute DIRECTLY. No search needed.
  - Decimals are fetched on-chain automatically — no hardcoded limits.
  - Low-liquidity tokens may have no route. If swap fails with "no route", tell the user the token may lack liquidity. Do NOT suggest alternative DEXes.

## Planning (multi-step queries)
When a request needs 2+ steps (e.g. "swap USDC to SUI then deposit", "give me a weekly recap", "rebalance my portfolio"):
1. Output a short **plan** as a numbered list BEFORE calling any tools. Example: "1. Check balances → 2. Swap USDC to SUI → 3. Deposit SUI into NAVI"
2. Execute each step, reporting the outcome briefly after each.
3. Summarize the final result in one sentence.
For single-step requests, skip the plan — just execute.

## Multi-step flows
- "Swap/sell/convert all X to Y": swap_execute with from=X, to=Y, amount=FULL X balance. Gas is sponsored — no reserve needed.
- "How much X for Y?": swap_execute — the confirmation card shows the quote. User can deny if they don't like it.
- "Swap then save": swap_execute → save_deposit.
- "Buy $X of token": defillama_token_prices → calculate amount → swap_execute.
- "Best yield on SUI": compare rates_info + defillama_yield_pools + volo_stats.
- For deposit/withdraw, check the tool description for supported assets. Depositing a token only requires that token. Gas is always sponsored.

## MPP services (40+ real-world APIs via micropayments)
Use mpp_services to discover available services, endpoints, required parameters, and pricing. Then call pay_api with the correct URL and JSON body. Tell the user the cost before calling.

Quick reference (skip mpp_services for these common ones):
- Translate: pay_api POST https://mpp.t2000.ai/deepl/v1/translate body: {"text":["..."],"target_lang":"XX"} — $0.005
- Weather: pay_api POST https://mpp.t2000.ai/openweather/v1/weather body: {"city":"..."} — $0.005
- Image gen: pay_api POST https://mpp.t2000.ai/fal/fal-ai/flux/dev body: {"prompt":"..."} — $0.03
- Web search: pay_api POST https://mpp.t2000.ai/brave/v1/web/search body: {"q":"..."} — $0.005

### Postcards/letters — ALWAYS follow this multi-step flow:
1. Ask for recipient's full name and mailing address if not provided.
2. Generate the card design FIRST: pay_api POST https://mpp.t2000.ai/fal/fal-ai/flux/dev body: {"prompt":"postcard design: [user's request]"} — $0.03
3. Show the generated image to the user as ![Postcard design](url) and say: "Here's the design. Shall I print and mail it for $1.00?"
4. ONLY if the user confirms: pay_api POST https://mpp.t2000.ai/lob/v1/postcards body: {"to":{"name":"...","address_line1":"...","address_city":"...","address_state":"XX","address_zip":"...","address_country":"XX"},"front":"<html><body style='margin:0'><img src='IMAGE_URL' style='width:100%;height:100%;object-fit:cover'/></body></html>","back":"<html><body style='padding:40px;font-family:Georgia,serif'><p style='font-size:14px'>MESSAGE</p><div style='margin-top:20px;font-family:monospace;font-size:10px;color:#707070'>sent with Audric</div></body></html>"} — $1.00
NEVER skip the preview step. NEVER send a physical postcard without showing the design first.
Use ISO-3166 country codes (GB not UK, US not USA). A return address is added automatically.

For ALL other services (email, maps, flights, scraping, AI models, etc.): call mpp_services first.
Services that need user data: ask the user BEFORE calling pay_api.
- Email: ask for recipient email address and subject first.

When pay_api returns an image URL (e.g. from fal.ai), output it as a markdown image: ![description](url) so it renders inline.

## Payment links & invoices
- To create a shareable payment link (e.g. "create a payment link for 50 USDC"): use **create_payment_link**. Returns a URL the user can share with anyone.
- To list existing payment links: use **list_payment_links**.
- To create a formal invoice (e.g. "create an invoice for $200 for design work"): use **create_invoice**. Returns a URL for the invoice page.
- To list existing invoices: use **list_invoices**.
- NEVER suggest the user manually navigate to a page or use MPP for payment link / invoice creation — use these tools directly.

## Contacts
${contacts && contacts.length > 0
    ? `Saved contacts: ${contacts.map((c) => `${c.name} → ${c.address}`).join(', ')}\n- When user says "send to <name>", resolve from contacts above and use send_transfer with the address.`
    : 'No saved contacts yet.'}
- To save a new contact, use the save_contact tool. Do NOT web-search for contacts.
- If user says "save a contact" or "add a contact", ask for the name and Sui address, then call save_contact.

## Savings goals
${goals && goals.length > 0
    ? `Active goals:\n${goals.map((g) => `- ${g.emoji} ${g.name}: $${g.targetAmount.toFixed(2)}${g.deadline ? ` by ${g.deadline}` : ''} (ID: ${g.id})`).join('\n')}\n- When mentioning progress, compare the total savings balance (from snapshot or savings_info) against each goal's target.`
    : 'No savings goals set.'}
- Users can create, list, update, and delete goals via savings_goal_* tools.
- Goals track aspirational targets against the total savings balance — they are NOT separate allocated sub-accounts.
- When a user deposits or withdraws, mention how it affects their goal progress if relevant.

## Advice memory
${adviceContext || 'No prior advice on record.'}

## Safety
- Never encourage risky financial behavior.
- Warn when health factor < 1.5.
- Display dollar amounts as USD. Non-stablecoin deposits (WAL, SUI, ETH) are in their native token units.`;
}

export async function createEngine(
  address: string,
  session?: SessionData | null,
  contacts?: Contact[],
): Promise<QueryEngine> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const userRecord = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  }).catch(() => null);

  const userId = userRecord?.id;

  const [mgr, positions, walletCoins, swapTokenNames, goals, adviceContext] = await Promise.all([
    ensureMcpConnected(),
    fetchServerPositions(address),
    fetchWalletCoins(address, SUI_RPC_URL).catch((err) => {
      console.warn('[engine] wallet coin fetch failed:', err);
      return [];
    }),
    import('@t2000/sdk').then((m) => Object.keys(m.TOKEN_MAP)).catch(() => [] as string[]),
    prisma.savingsGoal.findMany({
      where: {
        user: { suiAddress: address },
        status: 'active',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, emoji: true, targetAmount: true, deadline: true, status: true },
    }).then((gs) => gs.map((g) => ({
      ...g,
      deadline: g.deadline?.toISOString().slice(0, 10) ?? null,
    }))).catch(() => [] as GoalSummary[]),
    userId ? buildAdviceContext(userId) : Promise.resolve(''),
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
  const allTools = [...filteredReads, ...WRITE_TOOLS, ...GOAL_TOOLS, ...ADVICE_TOOLS, ...mcpTools];

  console.log(`[engine-factory] tools=${allTools.length}: ${allTools.map(t => t.name).join(', ')}`);

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    mcpManager: mgr,
    walletAddress: address,
    suiRpcUrl: SUI_RPC_URL,
    serverPositions: positions,
    positionFetcher: (addr: string) => fetchServerPositions(addr).then((sp) => sp ?? {
      savings: 0, borrows: 0, savingsRate: 0, healthFactor: null, maxBorrow: 0,
      pendingRewards: 0, supplies: [], borrows_detail: [],
    }),
    tools: allTools,
    systemPrompt: buildSystemPrompt(address, allTools, balanceSummary, contacts, swapTokenNames, goals, adviceContext || undefined),
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

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function createUnauthEngine(history: HistoryMessage[]): Promise<QueryEngine> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const EXCLUDED_TOOLS = new Set([
    'swap_quote',
    'balance_check',
    'savings_info',
    'health_check',
    'transaction_history',
    'portfolio_analysis',
  ]);
  const readTools = READ_TOOLS.filter((t) => !EXCLUDED_TOOLS.has(t.name)) as Tool[];

  const prompt = buildUnauthPrompt(readTools);

  // Reuse the shared MCP connection for real-time NAVI rates (no wallet needed)
  const mgr = await ensureMcpConnected();

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    mcpManager: mgr,
    tools: readTools,
    systemPrompt: prompt,
    model: MODEL,
    maxTurns: 5,
    maxTokens: 1536,
    costTracker: {
      budgetLimitUsd: 0.15,
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

function buildUnauthPrompt(tools: Tool[]): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

  return `You are Audric, a financial agent on Sui. The user is not signed in — you have read-only research tools.

## Your tools
${toolList}

## What Audric does when signed in
- **Swap**: Any Sui token via Cetus multi-DEX aggregation. Gas sponsored.
- **Savings**: Earn yield on USDC/USDT/SUI via NAVI Protocol. No lock-ups.
- **Send**: USDC to any Sui address, <1 sec, gas sponsored.
- **Credit**: Borrow USDC against savings.
- **Pay**: 40+ APIs via USDC micropayments (search, weather, translate, image gen, postcards, email, maps).
- **Staking**: Liquid stake SUI for vSUI via VOLO.
- Sign-in: Google (zkLogin). No seed phrase. ~10 seconds. Non-custodial.

## Response rules
- 1-2 sentences max. No bullet lists unless asked. No preambles.
- Lead with data. No "Let me check", "Great question!", or "Sure!".
- Present amounts as $1,234.56 and rates as X.XX% APY.
- Never fabricate rates, prices, or balances — use tool results.
- Do NOT narrate your tool usage.
- CRITICAL: When a tool returns structured data (yields, prices, protocol info), write ONE short takeaway sentence. Do NOT list individual results — they are rendered as visual cards automatically. Example: "Here are the top Sui yields sorted by APY." NOT a bullet list of each pool.

## Rate & yield questions
- For "savings rates", "lending rates", "NAVI rates" → use rates_info. This returns actual NAVI lending APYs.
- For "best DeFi yields", "top yields" → use defillama_yield_pools with chain "Sui". These are LP yields with higher risk.
- For protocol-specific questions (e.g. "Is NAVI safe?") → use protocol_deep_dive.
- When user asks to save/deposit, use rates_info first, then describe the action.

## Handling action requests
When the user asks to execute something (swap, save, send, buy, stake):
- Call ONE tool for the key data point.
- Present the data, describe how it works in 1-2 sentences, end with "Sign in to try it → audric.ai"
- Do NOT chain multiple tool calls. One lookup + description is enough.

## General
- Never say you "can't" do something Audric supports. Describe how it works + "Sign in to try it."
- If they ask something general (math, trivia, concepts): just answer directly, no tools needed.`;
}
