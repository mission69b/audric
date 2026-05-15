import {
  QueryEngine,
  // [SPEC 37 v0.7a Phase 1 / 2026-05-15] Migrated from hand-rolled
  // `AnthropicProvider` (engine ≤1.30.x) to AI SDK-backed
  // `AISDKAnthropicProvider` (engine 1.31.0+). Drop-in `LLMProvider`
  // implementation — same constructor signature `{ apiKey }`, same
  // event stream contract (`ProviderEvent`), same retry-before-first-
  // token semantics + same `external.retry_count` telemetry. The legacy
  // provider stays exported as `@deprecated` for one soak window so we
  // can revert without an engine bump if anything regresses.
  AISDKAnthropicProvider,
  McpClientManager,
  NAVI_MCP_CONFIG,
  READ_TOOLS,
  WRITE_TOOLS,
  updateTodoTool,
  addRecipientTool,
  adaptAllServerTools,
  buildCachedSystemPrompt,
  classifyEffort,
  harnessShapeForEffort,
  applyToolFlags,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_PERMISSION_CONFIG,
  RecipeRegistry,
  type AddressPortfolio,
  type SessionData,
  type SessionStore,
  type ServerPositionData,
  type Message,
  type Tool,
  type ConversationState,
  type UserFinancialProfile,
  type UserPermissionConfig,
  type ThinkingEffort,
} from '@t2000/engine';
import { SUPPORTED_ASSETS } from '@t2000/sdk';
import { env } from '@/lib/env';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import './init-engine-stores';
import { UpstashSessionStore } from './upstash-session-store';
import { getRecipeRegistry } from './recipes';
import { UpstashConversationStateStore } from './upstash-conversation-state-store';
import { incrementSessionSpend } from './session-spend';
import { applyAccountAgeGate, computeAccountAgeDays } from './account-age-gate';
import { ADVICE_TOOLS } from './advice-tool';
import { audricSaveContactTool, audricListContactsTool } from './contact-tools';
import { lookupUserTool } from './lookup-user-tool';
import { audricMppServicesTool } from './mpp-services-tool';
import { audricPrepareBundleTool } from './prepare-bundle-tool';
import { composePdfTool } from './compose-pdf-tool';
import { composeImageGridTool } from './compose-image-grid-tool';
import { detectPriorPlanContext, isAffirmativeConfirmReply } from './confirm-detection';
import { emitPlanContextPromoted } from './plan-context-metrics';
import { isHarnessV9Enabled } from '@/lib/interactive-harness';
import { prisma } from '@/lib/prisma';
import { getPortfolio, getTokenPrices } from '@/lib/portfolio';
import {
  buildAdviceContext,
  buildFullDynamicContext,
  STATIC_SYSTEM_PROMPT,
  type WalletBalanceSummary,
  type Contact,
} from './engine-context';
import {
  getUserFinancialContext,
  invalidateUserFinancialContext,
} from '@/lib/redis/user-financial-context';
import { runStartupCheck } from './spec-consistency';

// [v1.4 Item 5] One-shot spec consistency check at module load. Dev-mode
// hard-fails to surface drift immediately; prod-mode logs only because CI
// is the real gate (see .github/workflows/ci.yml).
runStartupCheck();

/**
 * [v1.5] Post-write refresh map — for each write tool, the read tools
 * whose state it invalidates. The engine auto-runs these after a
 * successful write (see `EngineConfig.postWriteRefresh`) and pushes
 * fresh `tool_result` blocks into the conversation BEFORE the LLM
 * narrates. Eliminates the "you now have ~$X total" hallucination
 * class — the model has authoritative ground truth in context and
 * physically cannot invent post-write totals.
 *
 * Coverage rules:
 *  - Anything that changes wallet balance      → balance_check
 *  - Anything that changes NAVI lending state  → savings_info
 *  - Anything that changes borrow/health       → health_check
 *
 * Read-only/internal writes (payment-link create, invoice create,
 * contact save) are intentionally excluded — they don't change
 * balances until paid, so refresh would just surface unchanged data.
 */
export const POST_WRITE_REFRESH_MAP: Record<string, string[]> = {
  // Savings (NAVI lending)
  save_deposit: ['balance_check', 'savings_info'],
  withdraw: ['balance_check', 'savings_info'],

  // Credit (NAVI borrowing — affects health factor)
  borrow: ['balance_check', 'savings_info', 'health_check'],
  repay_debt: ['balance_check', 'savings_info', 'health_check'],

  // Pay
  send_transfer: ['balance_check'],
  pay_api: ['balance_check'],

  // Swap
  swap_execute: ['balance_check'],

  // Liquid staking (Volo) — vSUI/SUI swap effectively
  volo_stake: ['balance_check'],
  volo_unstake: ['balance_check'],

  // Claim rewards — adds tokens to wallet, may also clear NAVI rewards
  claim_rewards: ['balance_check', 'savings_info'],

  // [Track B / 2026-05-08] Compound — claims clear rewards (savings_info),
  // swap leg moves wallet balances (balance_check), final deposit adds
  // to NAVI USDC pool (savings_info), AND it can affect health factor
  // since collateral changed (health_check). Refresh all three so the
  // narration after settlement reflects ground truth.
  harvest_rewards: ['balance_check', 'savings_info', 'health_check'],
};

/**
 * [v1.5.1] Set of tools whose results depend on mutable on-chain state —
 * derived from the refresh map's union of all targets. These are exactly
 * the tools the engine marks `cacheable: false`. We expose this set so
 * `harness-metrics.ts` can detect drift: if any tool in this set ever
 * shows `resultDeduped: true` in `TurnMetrics.toolsCalled`, microcompact
 * has wrongly collapsed a fresh-state read — i.e. someone added a new
 * mutable tool to the refresh map but forgot the `cacheable: false`
 * flag in the engine package. Should always be 0 in production.
 */
export const MUTABLE_TOOL_SET: ReadonlySet<string> = new Set(
  Object.values(POST_WRITE_REFRESH_MAP).flat(),
);

const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
// [v1.4 BlockVision] Pro-tier Indexer REST API key. Same vendor as the
// JSON-RPC routing in `lib/sui-rpc.ts`, but a different API surface
// (`api.blockvision.org/v2/sui/...`, `x-api-key` header). Required by the
// env schema — boot fails if missing/empty, so this is guaranteed to be
// a non-empty string here. The engine's BlockVision callers
// (`fetchAddressPortfolio` / `fetchTokenPrices`) keep their internal
// degraded-fallback paths as defense-in-depth, but the runtime keeps
// them from ever firing in this app.
const BLOCKVISION_API_KEY = env.BLOCKVISION_API_KEY;
const SONNET_MODEL = 'claude-sonnet-4-6';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MODEL_OVERRIDE = env.AGENT_MODEL;
const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const SUI_RPC_URL = getSuiRpcUrl();
// Internal base URL for engine tools that hit Audric's own /api/internal/*
// routes (payment links, invoices, activity summaries, spending analytics).
// Falls back to a same-origin path so server-side fetches work in any
// deployment without per-env configuration.
const AUDRIC_INTERNAL_API_URL =
  env.AUDRIC_INTERNAL_API_URL ?? env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
const AUDRIC_INTERNAL_KEY = env.T2000_INTERNAL_KEY;
// [PR-B2] BRAVE_API_KEY now flows through ToolContext.env instead of the
// engine reading process.env directly. Goes hand-in-hand with the engine
// drop of the process.env fallback in `web-search.ts`. Empty string when
// unset — `web_search` returns "not configured" gracefully.
const BRAVE_API_KEY = env.BRAVE_API_KEY ?? '';

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

/**
 * [single-source-of-truth — Apr 2026] Reads from canonical `getPortfolio`
 * (which calls `fetchPositions` under the hood) so the engine, the
 * dashboard, the daily cron, and the LLM all see identical NAVI position
 * data. The transform here just renames the wire shape's `borrowsDetail`
 * → engine's `borrows_detail`.
 */
export async function fetchServerPositions(address: string): Promise<ServerPositionData | undefined> {
  try {
    const portfolio = await getPortfolio(address);
    const pos = portfolio.positions;
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
  /**
   * [v1.4] Total USD already auto-executed in this chat session. Threaded
   * into the engine to enforce `autonomousDailyLimit`. Optional; `undefined`
   * disables the cumulative cap.
   */
  sessionSpendUsd?: number;
  /**
   * [v1.4] Session id used by the engine's `onAutoExecuted` callback to
   * persist incremental spend back into Redis. Required when
   * `sessionSpendUsd` is set or daily-cap accounting is desired.
   */
  sessionId?: string;
  /**
   * [v1.4 Item 4] Surface routing decisions (effort + resolved model) so
   * the chat route's `TurnMetricsCollector` can record them without
   * re-implementing classifier logic. Fired exactly once after the
   * engine is constructed.
   *
   * [SPEC 8 v0.5.1 B3.2] Also surfaces the derived `harnessShape` and a
   * 1-line `harnessRationale`. Chat route stashes both and passes them
   * into `engine.submitMessage(prompt, { harnessShape, harnessRationale })`
   * so the engine can yield the one-shot `harness_shape` event at turn
   * start. `TurnMetrics.harnessShape` records the shape verbatim for
   * dashboard segmentation.
   */
  onMeta?: (meta: {
    effortLevel: string;
    modelUsed: string;
    harnessShape: 'lean' | 'standard' | 'rich' | 'max';
    harnessRationale: string;
  }) => void;
  /**
   * [v1.4 Item 4] Per-guard observation hook forwarded directly to the
   * engine's `onGuardFired`. Hosts wire their `TurnMetricsCollector`
   * here so guard verdicts surface in `TurnMetrics.guardsFired`.
   */
  onGuardFired?: (guard: {
    name: string;
    tier: 'safety' | 'financial' | 'ux';
    action: 'allow' | 'warn' | 'block';
    injectionAdded: boolean;
  }) => void;
  /**
   * [S.126 Tier 2c / 2026-05-09] Set true ONLY when this engine is built
   * for the post-write narrate stream (resume route). Forces effort →
   * `low` and routes to Haiku-no-thinking, skipping the plan-context
   * promotion entirely. Saves ~2-3s of LLM latency on every write
   * settlement vs Sonnet+thinking-medium.
   *
   * Safe because:
   *   - Audric writes settle as atomic Sui PTBs (single tx hash) —
   *     by the time resume fires, ALL legs are already on-chain. The
   *     resume turn's job is (1) parse the engine-injected post-write
   *     refresh tool_results, (2) narrate the receipt. No reasoning,
   *     no chained writes to emit.
   *   - The post-write refresh injects fresh balance_check / savings_info
   *     before narrate — Haiku has authoritative numbers to cite, can't
   *     hallucinate. Receipt narration is exactly the small-fact-pattern
   *     Haiku-lean is best at.
   *   - Sequential-path bundles (≥5 ops, rare) DO emit chained writes
   *     in resume; if the demotion regresses those, harness-metrics
   *     `audric.harness.bundle_outcome_count` would show it. Mitigation
   *     would be a future post-MAX_BUNDLE_OPS gate (don't demote when
   *     pending action carried a sequential plan).
   *
   * Not set by the chat route — chat-route writes are confirm-tier
   * pending_action emission, which DOES need the planner's reasoning.
   */
  isPostWriteResume?: boolean;
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
    select: { id: true, username: true, usernameClaimedAt: true, createdAt: true },
  }).catch(() => null);

  const userId = userRecord?.id;
  // [SPEC 30 D-13 — 2026-05-14] Account-age gate input. Floored days
  // since createdAt; null when user record missing (engine treats as
  // legacy fail-open). Consumed below at `permissionConfig` build.
  const accountAgeDays = computeAccountAgeDays(userRecord?.createdAt ?? null);

  // [single-source-of-truth — Apr 2026] One canonical `getPortfolio()`
  // call replaces the previous `fetchServerPositions` + `fetchWalletCoins`
  // pair. Wallet (priced) and NAVI positions come from the same
  // canonical fetcher the dashboard, /api/portfolio, and the daily cron
  // use, so the LLM's synthetic balance_check seed and the rendered
  // dashboard hero can never disagree.
  const [
    mgr,
    portfolio,
    swapTokenNames,
    adviceContext,
    profileRecord,
    memoryRecords,
    financialContext,
  ] = await Promise.all([
    ensureMcpConnected(),
    getPortfolio(address).catch((err) => {
      console.warn('[engine] canonical portfolio fetch failed:', err);
      return null;
    }),
    import('@t2000/sdk').then((m) => Object.keys(m.TOKEN_MAP)).catch(() => [] as string[]),
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
    // [v1.4.2 — Day 5 / Spec Item 6] Daily orientation snapshot read-
    // through cache. Joins the rest of the Promise.all so the engine-
    // boot critical path doesn't gain a serial round-trip; on a Redis
    // hit this is sub-ms, on a cold miss it's one Prisma read. Returns
    // null for brand-new users (skip the section), Redis errors
    // (degrade to Prisma), or Prisma errors (skip the section). Never
    // throws — `getUserFinancialContext` swallows transport failures.
    getUserFinancialContext(address),
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

  // [single-source-of-truth — Apr 2026] Derive held coins + per-coin
  // prices from the canonical portfolio's already-priced `wallet` array.
  // No second BlockVision round-trip for held coins — same data the
  // dashboard sees.
  const walletCoinsPriced = portfolio?.wallet ?? [];
  const nonZeroCoins = walletCoinsPriced.filter(
    (c) => c.balance != null && Number(c.balance) > 0,
  );

  // Map positions back into the engine `ServerPositionData` shape (just
  // a field rename for `borrowsDetail` → `borrows_detail`).
  const positions: ServerPositionData | undefined = portfolio
    ? {
        savings: portfolio.positions.savings,
        borrows: portfolio.positions.borrows,
        savingsRate: portfolio.positions.savingsRate,
        healthFactor: portfolio.positions.healthFactor,
        maxBorrow: portfolio.positions.maxBorrow,
        pendingRewards: portfolio.positions.pendingRewards,
        supplies: portfolio.positions.supplies.map((s) => ({
          asset: s.asset, amount: s.amount, amountUsd: s.amountUsd, apy: s.apy, protocol: s.protocol,
        })),
        borrows_detail: portfolio.positions.borrowsDetail.map((b) => ({
          asset: b.asset, amount: b.amount, amountUsd: b.amountUsd, apy: b.apy, protocol: b.protocol,
        })),
      }
    : undefined;

  // Reference prices for tokens the user can swap INTO but doesn't
  // currently hold. The canonical portfolio only prices held coins, so
  // tokens like NAVX/CETUS/DEEP/ETH/WAL still need a separate
  // `fetchTokenPrices` call — without it the LLM falls back to (stale)
  // training memory and emits "$3.50/SUI" hallucinations.
  //
  // [v1.4 BlockVision] [v1.4.1 — M6'] Critical-path call. The
  // BlockVision helper wraps each chunk in `AbortSignal.timeout(3000)`
  // and chunks transparently when `tokenIds` exceeds the 10-token API
  // cap; the `.catch(() => ({}))` envelope keeps a slow / failing
  // response from hanging the engine.
  const referenceCoinTypes = Object.values(SUPPORTED_ASSETS).map((a) => a.type);
  const heldCoinTypes = nonZeroCoins.map((c) => c.coinType);
  const heldCoinTypeSet = new Set(heldCoinTypes);
  const referenceOnlyCoinTypes = referenceCoinTypes.filter((t) => !heldCoinTypeSet.has(t));
  const referencePrices = referenceOnlyCoinTypes.length > 0
    ? await getTokenPrices(referenceOnlyCoinTypes).catch(
        () => ({} as Record<string, { price: number; change24h?: number }>),
      )
    : {};

  const prices: Record<string, number> = {};
  for (const coin of walletCoinsPriced) {
    if (coin.price != null) prices[coin.coinType] = coin.price;
  }
  for (const [coinType, entry] of Object.entries(referencePrices)) {
    if (prices[coinType] == null) prices[coinType] = entry.price;
  }

  const balanceSummary: WalletBalanceSummary = {
    coins: nonZeroCoins.map((c) => {
      const amount = Number(c.balance) / 10 ** c.decimals;
      return {
        symbol: c.symbol,
        amount,
        usdValue: c.usdValue ?? (c.price != null ? amount * c.price : undefined),
      };
    }),
    prices,
    // symbolPrices is filled in below after we build the priceCache.
  };

  // B.4: Build symbol → USD price map for permission resolution AND for
  // surfacing in the system prompt / synthetic balance_check result. We
  // include both the user's held coins and the canonical supported assets
  // so the LLM has a price for every token it can swap into.
  const priceCache = new Map<string, number>();
  for (const coin of nonZeroCoins) {
    if (coin.price != null) priceCache.set(coin.symbol.toUpperCase(), coin.price);
  }
  for (const asset of Object.values(SUPPORTED_ASSETS)) {
    if (priceCache.has(asset.symbol.toUpperCase())) continue;
    const p = prices[asset.type];
    if (p) priceCache.set(asset.symbol.toUpperCase(), p);
  }
  if (!priceCache.has('USDC')) priceCache.set('USDC', 1);
  if (!priceCache.has('USDT')) priceCache.set('USDT', 1);

  // Symbol→USD map (sorted by symbol for stable cache hits) used by both the
  // synthetic balance_check prefetch and the system-prompt Session Context.
  const symbolPrices: Record<string, number> = {};
  for (const symbol of [...priceCache.keys()].sort()) {
    symbolPrices[symbol] = priceCache.get(symbol)!;
  }
  balanceSummary.symbolPrices = symbolPrices;

  // B.4: Load per-user permission config (fall back to defaults)
  const userPrefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  }).catch(() => null);
  const rawPermissionConfig: UserPermissionConfig =
    (userPrefs?.limits as UserPermissionConfig | null) ?? DEFAULT_PERMISSION_CONFIG;
  // [SPEC 30 D-13 — 2026-05-14] Account-age gate: < 7d accounts get
  // every `autoBelow` zeroed → no auto-tier writes can fire. Closes
  // takeover-while-onboarding drain class. After Day 7 the gate is a
  // no-op (returns the input config unchanged).
  const permissionConfig = applyAccountAgeGate(rawPermissionConfig, accountAgeDays);

  const MCP_ALLOWLIST = new Set([
    'navi_sui_get_transaction',
    'navi_sui_explain_transaction',
    'navi_navi_search_tokens',
  ]);

  const mcpTools = adaptAllServerTools(mgr).filter(
    (t) => MCP_ALLOWLIST.has(t.name),
  ) as Tool[];

  // swap_quote is REQUIRED before swap_execute (enforced by the engine
  // guardSwapPreview). Without an on-chain quote the LLM can only estimate
  // from prices, which is fine for "how much is X token" but misses route +
  // price impact for actual trades. Quoting is read-only and fast.
  // [SPEC 23B-MPP6 UX polish followup / 2026-05-12] Replace the engine's
  // generic mpp_services (returns full ~40-service gateway catalog) with
  // an audric-side override that filters to the 5 supported services
  // (openai, elevenlabs, pdfshift, lob, resend). Pre-fix the LLM was told
  // by the system prompt to use only the 5, but the discover-services
  // CARD shown to the user displayed all 40 — confusing because the user
  // could see services Audric would refuse to use. See
  // `mpp-services-tool.ts` header for the full rationale.
  const EXCLUDED_TOOLS = new Set<string>(['mpp_services']);
  const filteredReads = READ_TOOLS.filter((t) => !EXCLUDED_TOOLS.has(t.name));
  const audricMppTools: Tool[] = [audricMppServicesTool];

  // Replace the engine's stub `save_contact` (no-op call returning
  // `{saved:true}`) with a Prisma-backed override that actually persists,
  // and add `list_contacts` so the LLM can authoritatively answer
  // "show me my contacts" without confessing the gap. Both live in
  // `lib/engine/contact-tools.ts`. See the file's header for context on
  // the persistence bug the previous client-only path produced.
  const filteredWrites = WRITE_TOOLS.filter((t) => t.name !== 'save_contact');
  const audricContactTools: Tool[] = [audricSaveContactTool, audricListContactsTool];

  // [SPEC 14 Phase 1] `prepare_bundle` plan-time bundle commitment tool.
  // The LLM calls this once during the plan turn for any multi-write
  // Payment Intent (N≥2 writes). The tool stashes the typed steps in
  // Redis with a 60s TTL; the chat-route fast-path (Phase 2, not yet
  // wired) will read + consume the stash on user confirm and yield a
  // `pending_action_bundle` SSE event without re-emitting via the LLM.
  // Phase 1 is dormant — registering the tool but not yet bypassing
  // the legacy path is intentional. See SPEC 14 for the full design.
  const audricBundleTools: Tool[] = [audricPrepareBundleTool];

  // [SPEC native_content_tools P2-P4 / 2026-05-13] Server-side
  // composition tools.
  //
  // - `composePdfTool`: replaces `pay_api(pdfshift/...)` for the
  //   "compose what we already have" use case (DALL-E images,
  //   LLM-authored text, markdown). Free, no gateway, can't fail with
  //   a vendor 400. See `compose-pdf-tool.ts` header for the rationale
  //   and the SPEC 24 whale-book smoke that motivated it.
  //
  // - `composeImageGridTool`: 2-9 image grid composition (collages),
  //   server-side via sharp. Use case: "compile these 4 DALL-E
  //   generations into a 2x2 grid" — previously the user got 4
  //   separate single-image cards.
  const audricCompositionTools: Tool[] = [composePdfTool, composeImageGridTool];

  // [SPEC 8 v0.5.1 hotfix] Register the host-side `update_todo` tool that
  // the system prompt teaches RICH / recipe-match turns to call. The engine
  // exports it as opt-in (see packages/engine/src/index.ts ~226-228); without
  // this line, the LLM physically cannot comply with the prompt and Gate 7
  // (RICH todo emission ≥50%) hard-fails at 0%. See SPEC 8 v0.5.2 patch
  // notes in audric-build-tracker.md.
  //
  // [SPEC 9 v0.1.3 P9.6] `addRecipientTool` is gated by NEXT_PUBLIC_HARNESS_V9.
  // The engine exports it as opt-in (engine/src/index.ts) — the LLM can only
  // call it when this flag-on code path adds it to the roster. When the flag
  // is off, the engine's `pending_input` event handling is still live (so a
  // stale browser tab doesn't crash on a SPEC 9 session), but no tool can
  // produce one.
  const harnessV9Enabled = isHarnessV9Enabled();
  const allTools = applyToolFlags([
    ...filteredReads,
    ...filteredWrites,
    ...audricMppTools,
    ...audricContactTools,
    ...audricBundleTools,
    ...audricCompositionTools,
    ...ADVICE_TOOLS,
    // [SPEC 10 D.3] Audric-side user-directory lookup. Audric handles
    // (`username.audric.sui`) live in the audric Postgres User table
    // alongside `claimedAt` + `suiAddress`; the engine is intentionally
    // unaware of the audric DB so the tool ships from the host. Sister
    // tool to engine's `resolve_suins` (which handles generic SuiNS).
    lookupUserTool,
    ...mcpTools,
    updateTodoTool,
    ...(harnessV9Enabled ? [addRecipientTool] : []),
  ]);

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
    financialContext,
    username: userRecord?.username ?? null,
    usernameClaimedAt: userRecord?.usernameClaimedAt ?? null,
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
  const classifierEffort = opts.message
    ? classifyEffort(model, opts.message, matchedRecipe, sessionWriteCount)
    : 'medium';
  const clamp = clampProposalEffort({
    classifierEffort,
    matchedRecipe,
    message: opts.message,
    sessionWriteCount,
  });
  let baseEffort = clamp.effort;
  const proposalEffortClamped = clamp.clamped;

  // [SPEC 13 / 1.14.1] Confirm-of-bundle promotion. When the user replies
  // "Confirmed" to a multi-write Payment Intent plan the base classifier
  // routes the short message to `low` → Haiku. Haiku then reliably emits
  // ONE write at a time, costing a guard-block + re-quote round-trip
  // before the atomic bundle lands. Promoting to `medium` (Sonnet) lets
  // the model that planned the bundle be the one that emits it.
  //
  // [SPEC 15 Phase 1 / 2026-05-04] Promotion now decides on the SHAPE OF
  // THE PRIOR ASSISTANT TURN, not the user's message text. The fast-path
  // bypass (`isAffirmativeConfirmReply`) keeps the strict regex; this
  // gate is liberal because the worst case (false positive) is one
  // wasted Sonnet-medium turn (~$0.03), and the failure case it prevents
  // — Haiku-lean rambling 7 K tokens for 69 s on "vamos" / "do it bro" /
  // a voice transcript / a typo Fix 1's regex doesn't cover — is much
  // worse. Telemetry tag `matched_regex` distinguishes whether Fix 1's
  // pattern would have caught the message; watching `matched_regex=false`
  // over a 24h window quantifies what Phase 1 catches that Fix 1 misses.
  let effort = baseEffort;
  let confirmPromoted = false;
  let postWriteDemoted = false;
  // [S.126 Tier 2c / 2026-05-09] Post-write resume narrate skips both
  // effort classification and plan-context promotion. The resume turn
  // narrates receipt of an already-settled atomic write — no reasoning
  // needed, just narration. Demote to Haiku-low-no-thinking. Saves
  // ~2-3s of LLM latency vs Sonnet+thinking-medium on every write.
  // See `CreateEngineOpts.isPostWriteResume` JSDoc for the full
  // safety analysis (atomicity guarantee + post-write refresh injection
  // make Haiku narration safe; sequential-bundle case is the bounded
  // risk and would show up in `audric.harness.bundle_outcome_count`).
  if (opts.isPostWriteResume) {
    effort = 'low';
    postWriteDemoted = true;
  } else if (baseEffort === 'low' && opts.session?.messages) {
    const detection = detectPriorPlanContext(opts.session.messages);
    if (detection.matched) {
      effort = 'medium';
      confirmPromoted = true;
      const userMessage = opts.message ?? '';
      const matchedRegex = userMessage.length > 0 && isAffirmativeConfirmReply(userMessage);
      console.log(
        `[engine-factory] plan-context detected → promoting low → medium (priorWriteVerbs=${detection.priorWriteVerbCount}, matchedRegex=${matchedRegex}, msg="${userMessage.slice(0, 30)}")`,
      );
      emitPlanContextPromoted({
        message: userMessage,
        matchedRegex,
        priorWriteVerbCount: detection.priorWriteVerbCount,
      });
    }
  }

  const routedModel = MODEL_OVERRIDE ?? (effort === 'low' ? HAIKU_MODEL : SONNET_MODEL);
  console.log(
    `[engine-factory] model=${routedModel} effort=${effort} thinking=${!routedModel.includes('haiku')}${confirmPromoted ? ' confirm_promoted=true' : ''}${postWriteDemoted ? ' post_write_demoted=true' : ''}${proposalEffortClamped ? ' proposal_effort_clamped=high→medium' : ''}`,
  );

  // [SPEC 8 v0.5.1 B3.2] Adaptive harness shape — derived from the same
  // effort classifier the thinking-budget routing uses. Rationale is a
  // 1-line human-readable explanation for telemetry; built from the
  // signals that actually drove the classifier's decision so a Datadog
  // operator skimming a turn can see WHY without re-running classify.
  const harnessShape = harnessShapeForEffort(effort);
  const harnessRationale = postWriteDemoted
    ? `post-write resume narrate → demoted to lean (S.126 Tier 2c)`
    : confirmPromoted
    ? `plan-context promoted low → medium`
    : proposalEffortClamped
    ? `write proposal in active session → clamped high → medium (S.126 Tier 2f)`
    : buildHarnessRationale({
        effort,
        matchedRecipeName: matchedRecipe?.name,
        sessionWriteCount,
        message: opts.message,
      });
  opts.onMeta?.({ effortLevel: effort, modelUsed: routedModel, harnessShape, harnessRationale });

  const engine = new QueryEngine({
    provider: new AISDKAnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
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
      BRAVE_API_KEY,
      // [SPEC 14 Phase 1] The `prepare_bundle` tool reads SESSION_ID
      // from `ToolContext.env` to scope its Redis stash. Engine doesn't
      // pass sessionId via a typed field today; threading via `env`
      // (which is already a Record<string, string>) avoids an engine
      // bump. Empty string when sessionId is missing — prepare_bundle
      // returns `ok: false reason: 'no_session'` defensively.
      SESSION_ID: opts.sessionId ?? '',
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
    // Saved contacts thread into both `guardAddressSource` (treats a
    // contact's address as a trusted source for `send_transfer.to`) and
    // the engine permission tier resolver (sends to non-contact
    // addresses always require client confirmation, regardless of amount).
    contacts: opts.contacts,
    sessionSpendUsd: opts.sessionSpendUsd,
    // [v1.4 BlockVision] Forwarded into every `ToolContext` build site
    // inside the engine. Empty per-request portfolio cache shared by
    // `balance_check` and `portfolio_analysis` for in-turn dedup.
    blockvisionApiKey: BLOCKVISION_API_KEY,
    portfolioCache: new Map<string, AddressPortfolio>(),
    // [v1.3 — G5] [v1.4.1 — M4'] [v1.4.2 — Day 5 / Spec Item 6]
    // `walletAddress` is populated by the engine from
    // `config.walletAddress`. Two side-effects chain here:
    //   1. `incrementSessionSpend` — Redis-backed session-spend
    //      accounting that feeds the autonomousDailyLimit cap.
    //   2. `invalidateUserFinancialContext(walletAddress)` — drops
    //      the cached orientation snapshot at `fin_ctx:${address}`
    //      so the next chat boot reads fresh DB state instead of the
    //      pre-write cron snapshot.
    // No `engine.invalidateBalanceCache()` call — there is no engine-
    // side balance cache (`postWriteRefresh` covers in-session balance
    // freshness; `balance_check` is `cacheable: false`). Both calls
    // are fail-open — failures surface to console.warn but never
    // propagate, mirroring confirm-tier behavior in `resume/route.ts`.
    onAutoExecuted: opts.sessionId
      ? async ({ usdValue, walletAddress }: { usdValue: number; walletAddress?: string }) => {
          await incrementSessionSpend(opts.sessionId!, usdValue);
          if (walletAddress) {
            await invalidateUserFinancialContext(walletAddress).catch(() => null);
          }
        }
      : undefined,
    // [F2 / engine v1.11] Tell the engine "the system prompt already
    // carries a balance + HF snapshot." Pre-fix, every first-turn write
    // fired redundant "Balance not checked / Health factor not checked"
    // hints despite the LLM having both numbers in its context window.
    // The seed flips `BalanceTracker.hasEverRead()` to true and seeds
    // `lastHealthFactor` for users with known HF.
    //
    // For zero-debt users (`healthFactor: null` in the snapshot), seed
    // with `+Infinity` — the guard's `< blockBelow` / `< warnBelow`
    // checks both pass trivially, and the hint stays silent. For
    // users whose snapshot lacks HF altogether, leave it `null` so
    // the hint correctly fires (legitimate "we don't know" state).
    financialContextSeed: financialContext
      ? {
          balanceAt: Date.now(),
          healthFactor:
            financialContext.healthFactor ??
            (financialContext.debtUsdc === 0 ? Number.POSITIVE_INFINITY : null),
        }
      : undefined,
    onGuardFired: opts.onGuardFired,
    // [v1.5] Auto-inject fresh balance/savings/health reads after every
    // successful write so post-write narration cites real numbers. See
    // `POST_WRITE_REFRESH_MAP` above.
    postWriteRefresh: POST_WRITE_REFRESH_MAP,
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
        // Symbol→USD price snapshot. The model MUST read prices from this
        // field (and the matching system-prompt block) for any swap/value
        // estimate — never from training memory. Includes both held coins
        // and canonical supported assets so unheld tokens are quotable too.
        prices: balances.symbolPrices ?? {},
        pricesAsOf: new Date().toISOString(),
      }),
    });
  }

  if (positions && (positions.savings > 0 || positions.borrows > 0)) {
    // [CHIP-Review-2 F-11b — May 2026] Pre-format APY decimals as percent
    // strings BEFORE serialising into the prefetch payload. The LLM was
    // reading the raw `savingsRate: 0.0787` field and faithfully echoing it
    // back as "0.079%" instead of multiplying by 100. Pre-formatting to
    // "7.87%" removes the ambiguity at the source — the model can only
    // copy the correctly-formatted string. Field names use the `Percent`
    // suffix so the model can't confuse them with decimal-valued fields.
    const fmtPct = (decimal: number) => `${(decimal * 100).toFixed(2)}%`;
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
        savingsRatePercent: fmtPct(positions.savingsRate),
        healthFactor: positions.healthFactor,
        maxBorrow: positions.maxBorrow,
        pendingRewards: positions.pendingRewards,
        supplies: positions.supplies.map((s) => ({
          asset: s.asset,
          amount: s.amount,
          amountUsd: s.amountUsd,
          apyPercent: fmtPct(s.apy),
          protocol: s.protocol,
        })),
        borrows: positions.borrows_detail.map((b) => ({
          asset: b.asset,
          amount: b.amount,
          amountUsd: b.amountUsd,
          apyPercent: fmtPct(b.apy),
          protocol: b.protocol,
        })),
      }),
    });
  }

  if (toolUses.length > 0) {
    // Anthropic conversations MUST start with a user message. Without
    // this seed, the engine's `validateHistory` "first message must be
    // user" shift drops our leading assistant turn and orphans the
    // prefetch tool_results — Anthropic rejects the request with
    // "tool_result blocks must follow tool_use" and the user sees a
    // "request was rejected by Anthropic" error on the first turn of a
    // new session that has both wallet holdings and savings.
    //
    // The `[session bootstrap]` sentinel is a deterministic marker the
    // LLM is trained to ignore — it never surfaces in narration, and
    // the read-intent classifier never matches against it because
    // classification runs against the user's actual `trimmedMessage`,
    // not conversation history.
    messages.push({ role: 'user', content: [{ type: 'text', text: '[session bootstrap]' }] });
    messages.push({ role: 'assistant', content: toolUses });
    messages.push({ role: 'user', content: toolResults });
    messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Session data loaded.' }] });
  }

  return messages;
}

export function generateSessionId(): string {
  return `s_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// ---------------------------------------------------------------------------
// [S.126 Tier 2f / 2026-05-09] Clamp the engine classifier's
// `sessionWriteCount > 0 && write-verb → high` promotion down to `medium`.
//
// Smoke data on bundle + repeat-swap proposals showed Sonnet+thinking-high
// adds ~3-4.5s of latency without measurably improving proposal quality:
//   - Tier 2a prompt rules (turn budget ≤3, combined plan+prepare_bundle,
//     single update_todo) already constrain proposal SHAPE.
//   - The 14 engine guards (Safety > Financial > UX) catch safety issues
//     at preflight + dispatch regardless of effort.
//   - Recipe-driven complex writes (`safe_borrow`, `bulk_mail`, any recipe
//     with ≥3 steps) still route to `high` via the engine classifier's
//     recipe-match path (lines 26-27 of classify-effort.ts) — those bypass
//     this clamp because `matchedRecipe` is set.
//
// Audric-side clamp (vs an engine change) avoids an engine npm publish +
// audric bump for a deployment-tuning decision. If the engine classifier
// evolves to encode this natively (e.g., a per-host `effortCap` config),
// this helper becomes a no-op and can be deleted.
// ---------------------------------------------------------------------------
export function clampProposalEffort(args: {
  classifierEffort: ThinkingEffort;
  matchedRecipe: { name: string } | null;
  message: string | undefined;
  sessionWriteCount: number;
}): { effort: ThinkingEffort; clamped: boolean } {
  const { classifierEffort, matchedRecipe, message, sessionWriteCount } = args;
  if (
    classifierEffort === 'high' &&
    !matchedRecipe &&
    message !== undefined &&
    /\b(borrow|withdraw|send|swap)\b/i.test(message) &&
    sessionWriteCount > 0
  ) {
    return { effort: 'medium', clamped: true };
  }
  return { effort: classifierEffort, clamped: false };
}

// ---------------------------------------------------------------------------
// [SPEC 8 v0.5.1 B3.2] Build a 1-line `harness_shape.rationale` string
// summarising why this turn landed in this shape. Mirrors the precedence
// in `classifyEffort()` (recipe match > write-history keyword > vocab
// heuristic > default) so a Datadog operator can skim turn metrics
// without re-running the classifier.
// ---------------------------------------------------------------------------

function buildHarnessRationale(args: {
  effort: 'low' | 'medium' | 'high' | 'max';
  matchedRecipeName?: string;
  sessionWriteCount: number;
  message?: string;
}): string {
  const { effort, matchedRecipeName, sessionWriteCount, message } = args;
  if (matchedRecipeName) {
    return `matched recipe ${matchedRecipeName} → ${effort}`;
  }
  if (sessionWriteCount > 0 && message && /borrow|withdraw|send|swap/i.test(message)) {
    return `session has prior writes + write-keyword → ${effort}`;
  }
  if (effort === 'low') return `single-fact lookup → lean`;
  if (effort === 'max') return `MAX-tier signal in message → max`;
  return `default heuristic → ${effort}`;
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
    provider: new AISDKAnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
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

  return `You are Audric, a financial agent on Sui. Audric is exactly five products: Audric Passport (Google sign-in, non-custodial Sui wallet, tap-to-confirm, sponsored gas — wraps every other product), Audric Intelligence (you — the 5-system brain: Agent Harness ${tools.length} tools, Reasoning Engine 14 guards + 6 skill recipes, Silent Profile, Chain Memory, AdviceLog), Audric Finance (manage money on Sui — Save via NAVI lending at 3-8% APY USDC, Credit via NAVI borrowing with health factor, Swap via Cetus aggregator across 20+ DEXs at 0.1% fee, Charts for yield/health/portfolio viz), Audric Pay (move money — send USDC, receive via payment links / invoices / QR — free, global, instant on Sui), and Audric Store (creator marketplace, ships Phase 5 — say "coming soon" if asked). Operation→product mapping: save, swap, borrow, repay, withdraw, charts → Audric Finance. send, receive, payment-link, invoice, QR → Audric Pay. You can also call 5 paid APIs (image generation, transcription, content generation, premium audio, PDF binding, physical mail, transactional email) via MPP micropayments using pay_api — this is an internal capability, not a promoted product. The user is not signed in — you have read-only research tools.

## Your tools
${toolList}

## What Audric does when signed in
- **Swap**: Any Sui token via Cetus multi-DEX aggregation. Gas sponsored.
- **Savings**: Earn yield on USDC/USDT/SUI via NAVI Protocol. No lock-ups.
- **Send**: USDC to any Sui address, <1 sec, gas sponsored.
- **Credit**: Borrow USDC against savings.
- **Pay**: 5 paid APIs via USDC micropayments (image gen + GPT-4o + Whisper via openai, premium TTS + sound effects via elevenlabs, HTML→PDF via pdfshift, physical postcards/letters via lob, transactional email via resend). For general web search, news, or current info, use the free web_search tool — pay_api has no search vendor.
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
- For "best yield on Sui" → compare rates_info (NAVI single-sided lending) and volo_stats (vSUI liquid staking).
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
