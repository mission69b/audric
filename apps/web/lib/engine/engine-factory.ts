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
  buildCachedSystemPrompt,
  classifyEffort,
  applyToolFlags,
  DEFAULT_GUARD_CONFIG,
  type SessionData,
  type SessionStore,
  type ServerPositionData,
  type Message,
  type Tool,
  type ConversationState,
} from '@t2000/engine';
import { UpstashSessionStore } from './upstash-session-store';
import { UpstashConversationStateStore } from './upstash-conversation-state-store';
import { GOAL_TOOLS } from './goal-tools';
import { ADVICE_TOOLS } from './advice-tool';
import { prisma } from '@/lib/prisma';
import {
  buildAdviceContext,
  buildFullDynamicContext,
  STATIC_SYSTEM_PROMPT,
  type WalletBalanceSummary,
  type Contact,
  type GoalSummary,
} from './engine-context';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6';
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const SUI_RPC_URL = `https://fullnode.${SUI_NETWORK}.sui.io:443`;
const ALLOWANCE_API_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
const AUDRIC_INTERNAL_KEY = process.env.T2000_INTERNAL_KEY ?? '';
const ENABLE_THINKING = process.env.ENABLE_THINKING === 'true';

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

export async function getConversationState(sessionId: string): Promise<ConversationState> {
  const store = new UpstashConversationStateStore(sessionId);
  return store.get();
}

export async function setConversationState(sessionId: string, state: ConversationState): Promise<void> {
  const store = new UpstashConversationStateStore(sessionId);
  await store.transition(state);
}

export interface CreateEngineOpts {
  address: string;
  session?: SessionData | null;
  contacts?: Contact[];
  message?: string;
  conversationState?: ConversationState;
}

export async function createEngine(
  addressOrOpts: string | CreateEngineOpts,
  session?: SessionData | null,
  contacts?: Contact[],
): Promise<QueryEngine> {
  // Support both the old (address, session, contacts) signature and the new opts object
  const opts: CreateEngineOpts = typeof addressOrOpts === 'string'
    ? { address: addressOrOpts, session, contacts }
    : addressOrOpts;

  const { address } = opts;

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

  const MCP_ALLOWLIST = new Set([
    'navi_sui_get_transaction',
    'navi_sui_explain_transaction',
    'navi_navi_search_tokens',
  ]);

  const mcpTools = adaptAllServerTools(mgr).filter(
    (t) => MCP_ALLOWLIST.has(t.name),
  ) as Tool[];

  const EXCLUDED_TOOLS = new Set(['swap_quote']);
  const filteredReads = READ_TOOLS.filter((t) => !EXCLUDED_TOOLS.has(t.name));
  const allTools = applyToolFlags([...filteredReads, ...WRITE_TOOLS, ...GOAL_TOOLS, ...ADVICE_TOOLS, ...mcpTools]);

  console.log(`[engine-factory] tools=${allTools.length}: ${allTools.map(t => t.name).join(', ')}`);

  // RE-1.3: Build system prompt using cache-optimized blocks
  const dynamicBlock = buildFullDynamicContext(address, allTools, {
    balances: balanceSummary,
    contacts: opts.contacts,
    swapTokenNames,
    goals,
    adviceContext: adviceContext || undefined,
    intelligence: {
      conversationState: opts.conversationState,
    },
  });

  const systemPrompt = ENABLE_THINKING
    ? buildCachedSystemPrompt([STATIC_SYSTEM_PROMPT], dynamicBlock)
    : `${STATIC_SYSTEM_PROMPT}\n\n---\n\n${dynamicBlock}`;

  // RE-1.2: Classify effort level based on message content
  const sessionWriteCount = opts.session?.messages?.filter(
    (m) => m.role === 'assistant' && Array.isArray(m.content) &&
      m.content.some((b: { type: string }) => b.type === 'tool_use'),
  ).length ?? 0;

  const effort = opts.message
    ? classifyEffort(MODEL, opts.message, null, sessionWriteCount)
    : 'medium';

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
    systemPrompt,
    model: MODEL,
    env: {
      ALLOWANCE_API_URL,
      AUDRIC_INTERNAL_KEY,
    },
    maxTurns: 10,
    maxTokens: effort === 'high' || effort === 'max' ? 16384 : 8192,
    toolChoice: 'auto',
    costTracker: {
      budgetLimitUsd: 0.50,
    },
    guards: DEFAULT_GUARD_CONFIG,
    ...(ENABLE_THINKING && {
      thinking: { type: 'adaptive' as const },
      outputConfig: { effort },
    }),
  });

  if (opts.session?.messages?.length) {
    engine.loadMessages(opts.session.messages);
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
