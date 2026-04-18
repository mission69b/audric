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
  DEFAULT_PERMISSION_CONFIG,
  RecipeRegistry,
  type SessionData,
  type SessionStore,
  type ServerPositionData,
  type Message,
  type Tool,
  type ConversationState,
  type UserFinancialProfile,
  type UserPermissionConfig,
} from '@t2000/engine';
import { UpstashSessionStore } from './upstash-session-store';
import { getRecipeRegistry } from './recipes';
import { UpstashConversationStateStore } from './upstash-conversation-state-store';
import { GOAL_TOOLS } from './goal-tools';
import { ADVICE_TOOLS } from './advice-tool';
import { prisma } from '@/lib/prisma';
import { fetchPositions as fetchPortfolioPositions } from '@/lib/portfolio-data';
import {
  buildAdviceContext,
  buildFullDynamicContext,
  STATIC_SYSTEM_PROMPT,
  type WalletBalanceSummary,
  type Contact,
  type GoalSummary,
} from './engine-context';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SONNET_MODEL = 'claude-sonnet-4-6';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MODEL_OVERRIDE = process.env.AGENT_MODEL;
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const SUI_RPC_URL = `https://fullnode.${SUI_NETWORK}.sui.io:443`;
// Internal base URL for engine tools that hit Audric's own /api/internal/*
// routes (payment links, invoices, activity summaries, spending analytics).
// Falls back to a same-origin path so server-side fetches work in any
// deployment without per-env configuration.
const AUDRIC_INTERNAL_API_URL =
  process.env.AUDRIC_INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://audric.ai';
const AUDRIC_INTERNAL_KEY = process.env.T2000_INTERNAL_KEY ?? '';

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
    const pos = await fetchPortfolioPositions(address);
    return {
      savings: pos.savings,
      borrows: pos.borrows,
      savingsRate: pos.savingsRate,
      healthFactor: pos.healthFactor,
      maxBorrow: pos.maxBorrow,
      pendingRewards: pos.pendingRewards,
      supplies: pos.supplies.map((s) => ({ asset: s.asset, amount: s.amount, amountUsd: s.amountUsd, apy: s.apy, protocol: s.protocol })),
      borrows_detail: pos.borrowsDetail.map((b) => ({ asset: b.asset, amount: b.amount, amountUsd: b.amountUsd, apy: b.apy, protocol: b.protocol })),
    };
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

  const [mgr, positions, walletCoins, swapTokenNames, goals, adviceContext, profileRecord, memoryRecords] = await Promise.all([
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
    userId ? prisma.userFinancialProfile.findUnique({
      where: { userId },
    }).catch(() => null) : Promise.resolve(null),
    userId ? prisma.userMemory.findMany({
      where: {
        userId,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { extractedAt: 'desc' },
      take: 8,
      select: { id: true, memoryType: true, content: true, extractedAt: true, source: true },
    }).catch(() => []) : Promise.resolve([]),
  ]);

  // [SIMPLIFICATION DAY 5] Phase D pattern-detected proposals removed.
  // ScheduledAction table is dropped; the pendingProposals path always
  // returned at most 1 row driving a "should I set up auto-X?" prompt that
  // we no longer surface (chat-first means the user just asks).
  const pendingProposals: Array<{
    id: string;
    patternType: string | null;
    actionType: string;
    amount: number;
    asset: string;
    confidence: number | null;
  }> = [];

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

  // B.4: Build symbol → USD price map for permission resolution
  const priceCache = new Map<string, number>();
  for (const coin of nonZeroCoins) {
    const p = prices[coin.coinType];
    if (p) priceCache.set(coin.symbol.toUpperCase(), p);
  }
  if (!priceCache.has('USDC')) priceCache.set('USDC', 1);
  if (!priceCache.has('USDT')) priceCache.set('USDT', 1);

  // B.4: Load per-user permission config (fall back to defaults)
  const userPrefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  }).catch(() => null);
  const permissionConfig: UserPermissionConfig =
    (userPrefs?.limits as UserPermissionConfig | null) ?? DEFAULT_PERMISSION_CONFIG;

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

  // Map Prisma profile record to engine type
  const profile: UserFinancialProfile | null = profileRecord
    ? {
        userId: profileRecord.userId,
        riskAppetite: profileRecord.riskAppetite as UserFinancialProfile['riskAppetite'],
        financialLiteracy: profileRecord.financialLiteracy as UserFinancialProfile['financialLiteracy'],
        prefersBriefResponses: profileRecord.prefersBriefResponses,
        prefersExplainers: profileRecord.prefersExplainers,
        currencyFraming: profileRecord.currencyFraming as UserFinancialProfile['currencyFraming'],
        primaryGoals: profileRecord.primaryGoals,
        knownPatterns: profileRecord.knownPatterns,
        riskConfidence: profileRecord.riskConfidence,
        literacyConfidence: profileRecord.literacyConfidence,
        lastInferredAt: profileRecord.lastInferredAt,
      }
    : null;

  const isNewSession = !opts.session?.messages?.length;

  // RE-1.3: Build system prompt using cache-optimized blocks
  const dynamicBlock = buildFullDynamicContext(address, allTools, {
    balances: balanceSummary,
    contacts: opts.contacts,
    swapTokenNames,
    goals,
    adviceContext: adviceContext || undefined,
    intelligence: {
      profile,
      conversationState: opts.conversationState,
      memories: memoryRecords.length > 0 ? memoryRecords : undefined,
      pendingProposals: pendingProposals.length > 0
        ? pendingProposals.map((p) => ({
            id: p.id,
            patternType: p.patternType ?? '',
            actionType: p.actionType,
            amount: p.amount,
            asset: p.asset,
            confidence: p.confidence ?? 0,
          }))
        : undefined,
    },
    useSyntheticPrefetch: isNewSession,
  });

  const systemPrompt = buildCachedSystemPrompt([STATIC_SYSTEM_PROMPT], dynamicBlock);

  // RE-1.2: Classify effort level based on message content + matched recipe
  const recipeRegistry = getRecipeRegistry();
  const matchedRecipe = opts.message ? recipeRegistry.match(opts.message) : null;

  const sessionWriteCount = opts.session?.messages?.filter(
    (m) => m.role === 'assistant' && Array.isArray(m.content) &&
      m.content.some((b: { type: string }) => b.type === 'tool_use'),
  ).length ?? 0;

  const model = MODEL_OVERRIDE ?? SONNET_MODEL;
  const effort = opts.message
    ? classifyEffort(model, opts.message, matchedRecipe, sessionWriteCount)
    : 'medium';
  const routedModel = MODEL_OVERRIDE ?? (effort === 'low' ? HAIKU_MODEL : SONNET_MODEL);
  console.log(`[engine-factory] model=${routedModel} effort=${effort} thinking=${!routedModel.includes('haiku')}`);

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
    model: routedModel,
    env: {
      AUDRIC_INTERNAL_API_URL,
      AUDRIC_INTERNAL_KEY,
    },
    maxTurns: 10,
    maxTokens: effort === 'high' || effort === 'max' ? 16384 : 8192,
    toolChoice: 'auto',
    costTracker: {
      budgetLimitUsd: 0.50,
    },
    guards: DEFAULT_GUARD_CONFIG,
    recipes: recipeRegistry,
    priceCache,
    permissionConfig,
    ...(!routedModel.includes('haiku') && {
      thinking: { type: 'adaptive' as const },
      outputConfig: { effort },
    }),
  });

  if (isNewSession) {
    const prefetch = buildSyntheticPrefetch(balanceSummary, positions);
    if (prefetch.length > 0) {
      engine.loadMessages(prefetch);
    }
  } else if (opts.session?.messages?.length) {
    engine.loadMessages(opts.session.messages);
  }

  return engine;
}

function buildSyntheticPrefetch(
  balances: WalletBalanceSummary,
  positions: ServerPositionData | undefined,
): Message[] {
  if (!balances.coins.length && !positions) return [];

  const messages: Message[] = [];
  const toolUses: { type: 'tool_use'; id: string; name: string; input: unknown }[] = [];
  const toolResults: { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }[] = [];

  if (balances.coins.length > 0) {
    const holdingsData = balances.coins.map((c) => ({
      symbol: c.symbol,
      balance: c.amount,
      usdValue: c.usdValue ?? 0,
    }));
    const totalUsd = holdingsData.reduce((sum, h) => sum + h.usdValue, 0);
    const usdcHolding = holdingsData.find((h) => h.symbol === 'USDC');

    toolUses.push({
      type: 'tool_use',
      id: 'prefetch_bal',
      name: 'balance_check',
      input: {},
    });
    toolResults.push({
      type: 'tool_result',
      toolUseId: 'prefetch_bal',
      content: JSON.stringify({
        holdings: holdingsData.filter((h) => h.usdValue >= 0.01),
        savings: positions?.savings ?? 0,
        debt: positions?.borrows ?? 0,
        pendingRewards: positions?.pendingRewards ?? 0,
        total: totalUsd + (positions?.savings ?? 0) - (positions?.borrows ?? 0) + (positions?.pendingRewards ?? 0),
        saveableUsdc: usdcHolding?.balance ?? 0,
      }),
    });
  }

  if (positions && (positions.savings > 0 || positions.borrows > 0)) {
    toolUses.push({
      type: 'tool_use',
      id: 'prefetch_sav',
      name: 'savings_info',
      input: {},
    });
    toolResults.push({
      type: 'tool_result',
      toolUseId: 'prefetch_sav',
      content: JSON.stringify({
        totalSavings: positions.savings,
        totalBorrows: positions.borrows,
        savingsRate: positions.savingsRate,
        healthFactor: positions.healthFactor,
        maxBorrow: positions.maxBorrow,
        pendingRewards: positions.pendingRewards,
        supplies: positions.supplies,
        borrows: positions.borrows_detail,
      }),
    });
  }

  if (toolUses.length > 0) {
    messages.push({ role: 'assistant', content: toolUses });
    messages.push({ role: 'user', content: toolResults });
    messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Session data loaded.' }] });
  }

  return messages;
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
    model: HAIKU_MODEL,
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

  return `You are Audric, a financial agent on Sui. Your live consumer products are Audric Finance (save, send, swap, borrow, repay, withdraw) and Audric Pay (pay any of 41 MPP-registered AI services with USDC). Audric Intelligence is the silent layer that shapes your replies — never surfaced as a notification. Audric Store (creator marketplace) ships in Phase 5; say "coming soon" if asked. The user is not signed in — you have read-only research tools.

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
