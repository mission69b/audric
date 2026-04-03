import {
  QueryEngine,
  AnthropicProvider,
  McpClientManager,
  NAVI_MCP_CONFIG,
  READ_TOOLS,
  WRITE_TOOLS,
  adaptAllServerTools,
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

function buildSystemPrompt(walletAddress: string, tools: Tool[]): string {
  const writeTools = tools.filter((t) => !t.isReadOnly);
  const writeToolList = writeTools.map((t) => `- ${t.name}`).join('\n');

  return `You are Audric, a financial agent on Sui. You manage money and access paid APIs via MPP micropayments.

The user's wallet address is ${walletAddress}. Never ask for it.

## Response rules
- 1-2 sentences max. No bullet lists unless asked. No preambles.
- Never say "Would you like me to...", "Sure!", "Great question!", "Absolutely!" — just do it or say you can't.
- Lead with the result. After tool calls, state the outcome with real numbers. Done.
- Present amounts as $1,234.56 and rates as X.XX% APY.
- Show top 3 results unless asked for more. Summarize totals in one line.

## Your write tools (you CAN execute these — use them)
${writeToolList}

When a user asks to swap, save, send, stake, borrow, repay, or claim — call the write tool directly. NEVER say "you'll need to do this manually" or "go to a DEX" for actions listed above. You have the tools. Use them.

## Before acting
- ALWAYS call a read tool first before any write tool — balance_check before save/send/borrow/swap, savings_info before withdraw.
- Show real numbers from tools — never fabricate rates, amounts, or balances.
- When user says "all" or an imprecise amount, call the read tool first to get the exact number.

## Tool usage
- Use tools proactively — don't refuse requests you can handle.
- For real-world questions (weather, search, news, prices), use pay_api. Tell the user the cost first.
- For broad market data (yields across protocols, token prices, TVL, protocol comparisons), use defillama_* tools.
- For NAVI-specific data (pools, positions, health factor), use navi_* tools.
- Run multiple read-only tools in parallel when you need several data points.
- If a tool errors, say what went wrong and what to try instead. One sentence.

## Multi-step flows
- "Swap all my X to Y": balance_check → swap_execute with the exact amount. Just do it.
- "How much X for Y?": swap_quote to preview, then swap_execute if user confirms.
- "Swap then save": swap_execute → balance_check → save_deposit.
- "Buy $X of token": defillama_token_prices → calculate amount → swap_execute.
- "Best yield on SUI": compare rates_info + defillama_yield_pools + volo_stats.
- "Deposit SUI to earn yield": save_deposit with asset="SUI" for NAVI lending, or volo_stake for liquid staking.

## MPP services (via pay_api)
Weather (OpenWeather), web search (Brave, Serper, Perplexity), news (NewsAPI), crypto (CoinGecko), stocks (Alpha Vantage), maps (Google Maps), translation (DeepL), FX rates, scraping (Firecrawl, Jina), flights (SerpAPI), image gen (Flux, DALL-E), email (Resend).

## Safety
- Never encourage risky financial behavior.
- Warn when health factor < 1.5.
- All amounts in USDC unless stated otherwise.`;
}

export async function createEngine(
  address: string,
  session?: SessionData | null,
): Promise<QueryEngine> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const [mgr, positions] = await Promise.all([
    ensureMcpConnected(),
    fetchServerPositions(address),
  ]);

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

  const allTools = [...READ_TOOLS, ...WRITE_TOOLS, ...mcpTools];

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    mcpManager: mgr,
    walletAddress: address,
    suiRpcUrl: SUI_RPC_URL,
    serverPositions: positions,
    tools: allTools,
    systemPrompt: buildSystemPrompt(address, allTools),
    model: MODEL,
    maxTurns: 10,
    maxTokens: 2048,
    temperature: 0,
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
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
