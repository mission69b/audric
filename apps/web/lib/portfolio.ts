// ---------------------------------------------------------------------------
// Canonical portfolio fetcher — SINGLE SOURCE OF TRUTH for "what is this
// wallet worth right now". Every API route, React hook, engine tool, and
// cron job that reads portfolio data MUST go through this file.
//
// See [.cursor/rules/single-source-of-truth.mdc] for the engineering
// standard this file enforces. Pre-unification (April 2026) we had five
// different code paths computing wallet USD with five different bugs;
// the rewrite collapses them into one canonical function backed by
// BlockVision (priced wallet) + the protocol registry (NAVI positions).
// ---------------------------------------------------------------------------

// [v0.54] Side-effect import — wires the Upstash DeFi cache store into
// the engine for THIS process. `/api/portfolio` and `/api/analytics/*`
// don't import `engine-factory.ts`, so without this they'd silently
// keep the engine's default `InMemoryDefiCacheStore` and serve a
// per-instance stale view (the SSOT regression that caused Full
// Portfolio Overview to under-count DeFi while balance_check showed
// the right number on the same chat turn). instrumentation.ts also
// loads it at boot — this is belt-and-suspenders for any runtime that
// skips the instrumentation hook.
import './engine/init-engine-stores';
import {
  fetchAddressPortfolio,
  fetchAddressDefiPortfolio,
  fetchTokenPrices,
  type AddressPortfolio,
  type PortfolioCoin,
  type DefiSummary,
} from '@t2000/engine';
import {
  fetchPositions,
  type PositionSummary,
  type SupplyEntry,
  type BorrowEntry,
} from '@/lib/portfolio-data';
import { env } from '@/lib/env';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import { sanitizeForLog } from '@/lib/log-sanitize';

const BLOCKVISION_API_KEY = env.BLOCKVISION_API_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Canonical portfolio shape. Every consumer deals with this exact shape;
 * adapters MUST NOT reshape, re-derive, or recompute fields.
 */
export interface Portfolio {
  address: string;
  /** Every priced coin held by the wallet (full BlockVision portfolio). */
  wallet: PortfolioCoin[];
  /**
   * Sum of every priced coin's USD value. This is the ONLY correct
   * `walletValueUsd`. Pre-unification, callers summed `USDC + USDsui`
   * (missing SUI + tradeables) or `USDC + raw SUI tokens` (unit-mixed).
   */
  walletValueUsd: number;
  /**
   * Per-symbol breakdown for backwards-compat with `WalletBalances`
   * shape. Derived from `wallet`; never source-of-truth.
   */
  walletAllocations: Record<string, number>;
  /** Lending positions (NAVI). */
  positions: PositionSummary;
  /**
   * Net USD value of all aggregated DeFi positions outside NAVI
   * (Bluefin, Suilend, Cetus, Aftermath, Volo, Walrus). Sourced from
   * BlockVision's per-protocol DeFi endpoints; mirrors what
   * `balance_check` reports as the "DeFi" line. Pre-DeFi-integration
   * (April 2026) `getPortfolio` omitted this and `netWorthUsd` was
   * silently lower than `balance_check.total` — the portfolio-history
   * canvas would render $X while balance_check showed $X + DeFi for
   * the same wallet. The bug surfaced for an external wallet with a
   * $7,520 Bluefin/Suilend position; the timeline showed $29,672 while
   * `balance_check` correctly returned $37,192.
   */
  defiValueUsd: number;
  /**
   * Source of the DeFi read. `blockvision` = all protocols responded,
   * `partial` = some failed (value may under-count), `partial-stale` =
   * cached positive value served because fresh fetch failed,
   * `degraded` = no API key or every protocol failed. Surfaces so the
   * UI / LLM can caveat DeFi appropriately when partial.
   */
  defiSource: DefiSummary['source'];
  /**
   * [Bug — 2026-04-28] Wall-clock ms when the underlying DeFi data was
   * priced. Forwarded so FullPortfolioCanvas can render "cached Nm ago"
   * for `partial-stale` reads. Pre-fix this was always undefined on the
   * canvas because the route + this lib stripped it, leaving the stale
   * caveat without a timestamp to render.
   */
  defiPricedAt: number;
  /**
   * `walletValueUsd + positions.savings + positions.pendingRewards
   *  + defiValueUsd - positions.borrows`. Mirrors balance_check's
   * canonical total formula exactly so timeline / balance_check /
   * portfolio cards never disagree on the same wallet.
   */
  netWorthUsd: number;
  /** `positions.savings * positions.savingsRate / 365`, capped at 0. */
  estimatedDailyYield: number;
  /** Source of the wallet read (`blockvision` or `sui-rpc-degraded`). */
  source: AddressPortfolio['source'];
  /** Epoch ms when the underlying wallet portfolio was priced. */
  pricedAt: number;
}

/**
 * Wallet-only convenience shape — used by the few callers that only
 * need balance/allocation breakdowns and want to skip the positions
 * fetch. Still routes through `getPortfolio` internally to preserve
 * the canonical caching path.
 */
export interface WalletSnapshot {
  address: string;
  coins: PortfolioCoin[];
  totalUsd: number;
  allocations: Record<string, number>;
  source: AddressPortfolio['source'];
  pricedAt: number;
}

// ---------------------------------------------------------------------------
// Canonical fetchers
// ---------------------------------------------------------------------------

// [SPEC 22.3 — 2026-05-10] In-flight Promise dedup. The chat route fires
// `getPortfolio(address)` early (right after auth) to overlap with the
// serial Prisma + session-store + spend-lookup work that runs before
// `createEngine()`. When `engine-factory.ts` then calls `getPortfolio`
// itself a few hundred ms later, this map serves the SAME in-flight
// Promise — no duplicate sub-fetches against BlockVision / NAVI / DeFi
// endpoints.
//
// Cleared on settle (resolve OR reject) so a failed first call doesn't
// poison subsequent calls. Address-keyed because every other property
// of the request is irrelevant — the underlying fetchAddressPortfolio,
// fetchPositions, and fetchAddressDefiPortfolio are all (address)-arity.
//
// Why not a TTL'd cache here: the underlying sub-fetchers already have
// their own caches (60s wallet, 60s DeFi, 60s positions). This map is
// strictly a "request collapsing" layer for the chat-turn boot path.
// Once a getPortfolio call resolves, future calls go straight to the
// sub-fetchers and pick up their cached/fresh state cleanly.
//
// Memory bound: < numUniqueAddressesInFlightAtOnce × 1 Promise. In
// practice ≤10 in-flight calls per Vercel instance.
const inflightPortfolioFetches = new Map<string, Promise<Portfolio>>();

/**
 * Fetch the canonical portfolio snapshot for a Sui wallet.
 *
 * Combines:
 *   - BlockVision Pro `/account/coins` (wallet balances + USD prices for
 *     every held coin, with Sui-RPC fallback + stable allow-list when
 *     BlockVision is unavailable). 60s in-process cache per address.
 *   - Protocol registry `fetchPositions` (NAVI lending state — savings,
 *     borrows, weighted APY, health factor, max borrow, pending rewards,
 *     per-asset supplies/borrows breakdown).
 *
 * Both upstream calls are address-aware and work for any Sui wallet,
 * not just the signed-in user. `walletValueUsd` is the sum of every
 * priced coin (NOT just stables). `netWorthUsd` accounts for both
 * wallet value and outstanding NAVI debt.
 *
 * Errors are caught and surfaced as empty defaults rather than
 * thrown — same degradation strategy `fetchPortfolio` had pre-rewrite,
 * so cron loops and prompt seeding don't crash on one bad RPC call.
 *
 * **In-flight dedup (SPEC 22.3)**: concurrent calls for the same
 * address share a single underlying fetch. Used by the chat route to
 * pre-warm the portfolio while auth/Prisma/session-store work runs
 * serially before `createEngine()` — see `prewarmPortfolio()`.
 */
export function getPortfolio(address: string): Promise<Portfolio> {
  // NOTE: this function is intentionally NOT `async`. Marking it async
  // would wrap the in-flight Promise in a fresh outer Promise on every
  // call, breaking reference equality and silently degrading dedup —
  // two concurrent callers would see two different Promise objects
  // (both resolving to the same value, but downstream code that uses
  // identity-comparison on Promises would be confused). Returning the
  // inflight Promise directly preserves identity so `getPortfolio(addr)
  // === getPortfolio(addr)` while a fetch is in flight.
  const inflight = inflightPortfolioFetches.get(address);
  if (inflight) return inflight;

  const promise = doGetPortfolio(address).finally(() => {
    inflightPortfolioFetches.delete(address);
  });
  inflightPortfolioFetches.set(address, promise);
  return promise;
}

/**
 * [SPEC 22.3 — 2026-05-10] Hint to start the portfolio fetch eagerly.
 * Returns `void` immediately (the underlying Promise lives in the
 * inflight map and is reused by the next `getPortfolio(address)`
 * call). Errors are intentionally swallowed — a pre-warm failure
 * means the subsequent real call also fails, with the SAME error
 * surfaced to the SAME caller.
 *
 * Call this from request entry points BEFORE doing slow synchronous-
 * looking work (Prisma queries, JWT decode, Redis reads). The chat
 * route saves ~300-500ms of cold TTFVP this way: the portfolio fan-
 * out (~1-3s typical, up to 6s on a slow protocol) runs in parallel
 * with everything else instead of after it.
 *
 * Safe to call multiple times — second call hits the inflight map
 * dedup. Safe to call without awaiting — the Promise won't be
 * garbage-collected because the inflight map retains it.
 */
export function prewarmPortfolio(address: string): void {
  void getPortfolio(address).catch(() => {
    // Swallow — the real consumer sees the same error.
  });
}

async function doGetPortfolio(address: string): Promise<Portfolio> {
  // Three independent reads in parallel. Each degrades to an empty/zero
  // shape on failure rather than throwing, so the canonical fetcher
  // never crashes a caller because one upstream is down. balance_check
  // uses the same allSettled-then-zero pattern.
  //
  // [Phase 20.1 Step 1 / SPEC 20 — 2026-05-10] Per-sub-fetch latency
  // instrumentation. Pre-instrumentation we knew `getPortfolio` was
  // already parallel (three Promise.allSettled-d sub-fetches) but had
  // no production-grade data on which sub-fetch dominates wall time
  // OR whether any consumer's call-site latency is high enough to
  // justify slice-aware fetchers (`getPortfolio({ include: { ... } })`).
  // The handoff's original Phase 20.1 framing — "redesign for
  // parallel" — turned out to be wrong (already parallel); Step 1
  // collects 24h of cold/warm timings before deciding the next move.
  //
  // Grep contract:
  //   vercel logs --since=24h | grep -E "^\[portfolio\] "
  //
  // Wall time is captured per sub-fetch via Date.now() bookends
  // pushed onto each promise. Cache-hit signal is implicit in the
  // latency bucket (sub-50ms = warm via @t2000/engine in-process
  // cache; >100ms = cold or network-bound). Total time is `max(...)`
  // since the three run in parallel.
  const t0 = Date.now();
  let walletMs = -1;
  let positionsMs = -1;
  let defiMs = -1;
  const [walletResult, positionsResult, defiResult] = await Promise.allSettled([
    fetchAddressPortfolio(address, BLOCKVISION_API_KEY, getSuiRpcUrl())
      .finally(() => { walletMs = Date.now() - t0; }),
    fetchPositions(address)
      .finally(() => { positionsMs = Date.now() - t0; }),
    fetchAddressDefiPortfolio(address, BLOCKVISION_API_KEY)
      .finally(() => { defiMs = Date.now() - t0; }),
  ]);
  const totalMs = Date.now() - t0;
  console.log(
    `[portfolio] address=${address} ` +
    `wallet_ms=${walletMs} positions_ms=${positionsMs} defi_ms=${defiMs} ` +
    `total_ms=${totalMs} ` +
    `wallet_ok=${walletResult.status === 'fulfilled'} ` +
    `positions_ok=${positionsResult.status === 'fulfilled'} ` +
    `defi_ok=${defiResult.status === 'fulfilled'}`,
  );

  const walletPortfolio: AddressPortfolio = walletResult.status === 'fulfilled'
    ? walletResult.value
    : { coins: [], totalUsd: 0, pricedAt: Date.now(), source: 'sui-rpc-degraded' };

  const positions: PositionSummary = positionsResult.status === 'fulfilled'
    ? positionsResult.value
    : {
        savings: 0,
        borrows: 0,
        savingsRate: 0,
        healthFactor: null,
        maxBorrow: 0,
        pendingRewards: 0,
        supplies: [],
        borrowsDetail: [],
      };

  const defi: DefiSummary = defiResult.status === 'fulfilled'
    ? defiResult.value
    : { totalUsd: 0, perProtocol: {}, pricedAt: Date.now(), source: 'degraded' };

  // [SPEC 30 Phase 1B.5 — 2026-05-14] CodeQL js/tainted-format-string:
  // `address` is user-controlled (HTTP query/body); inlining into the
  // log template enables CRLF injection. Sanitize once.
  const safeAddress = sanitizeForLog(address);
  if (walletResult.status === 'rejected') {
    console.error(`[portfolio] wallet fetch failed for ${safeAddress}:`, walletResult.reason);
  }
  if (positionsResult.status === 'rejected') {
    console.error(`[portfolio] positions fetch failed for ${safeAddress}:`, positionsResult.reason);
  }
  if (defiResult.status === 'rejected') {
    console.error(`[portfolio] defi fetch failed for ${safeAddress}:`, defiResult.reason);
  }

  // Per-symbol allocations map for backwards-compat with consumers that
  // expect the old `WalletBalances.allocations` shape (e.g. the daily
  // financial-context-snapshot cron reads `allocations.USDsui` to
  // populate the LLM's `<financial_context>` block). Derived from the
  // canonical `wallet` array; never a source of truth.
  const walletAllocations: Record<string, number> = {};
  for (const coin of walletPortfolio.coins) {
    if (!coin.symbol) continue;
    const decimals = coin.decimals;
    const amount = Number(coin.balance) / 10 ** decimals;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    // Aggregate by symbol — multiple coin types with the same symbol
    // (rare but possible for testnet/legacy tokens) sum together so
    // the allocation map stays stable.
    walletAllocations[coin.symbol] = (walletAllocations[coin.symbol] ?? 0) + amount;
  }

  // Canonical net-worth formula. Mirrors `balance_check`'s `total`:
  //   total = availableUsd + savings + gasReserveUsd + pendingRewardsUsd + defi.totalUsd - debt
  // where `availableUsd + gasReserveUsd` is the priced wallet sum
  // (= `walletPortfolio.totalUsd` here). Keeping these two formulas
  // byte-for-byte identical is the whole point of the SSOT — drift
  // means the timeline canvas and balance_check show different totals
  // for the same wallet on the same second, which is exactly the
  // class of bug the SSOT was introduced to eliminate.
  const netWorthUsd =
    walletPortfolio.totalUsd
    + positions.savings
    + positions.pendingRewards
    + defi.totalUsd
    - positions.borrows;
  const estimatedDailyYield = positions.savings > 0 && positions.savingsRate > 0
    ? Math.max(0, (positions.savings * positions.savingsRate) / 365)
    : 0;

  return {
    address,
    wallet: walletPortfolio.coins,
    walletValueUsd: walletPortfolio.totalUsd,
    walletAllocations,
    positions,
    defiValueUsd: defi.totalUsd,
    defiSource: defi.source,
    defiPricedAt: defi.pricedAt,
    netWorthUsd,
    estimatedDailyYield,
    source: walletPortfolio.source,
    pricedAt: walletPortfolio.pricedAt,
  };
}

/**
 * Fetch only the priced wallet snapshot — skips the positions call.
 * Use when the caller genuinely only needs balances (e.g. the
 * watch-address canvas's coin list). Still routes through the same
 * BlockVision-backed fetcher as `getPortfolio`.
 */
export async function getWalletSnapshot(address: string): Promise<WalletSnapshot> {
  const portfolio = await fetchAddressPortfolio(address, BLOCKVISION_API_KEY, getSuiRpcUrl());

  const allocations: Record<string, number> = {};
  for (const coin of portfolio.coins) {
    if (!coin.symbol) continue;
    const amount = Number(coin.balance) / 10 ** coin.decimals;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    allocations[coin.symbol] = (allocations[coin.symbol] ?? 0) + amount;
  }

  return {
    address,
    coins: portfolio.coins,
    totalUsd: portfolio.totalUsd,
    allocations,
    source: portfolio.source,
    pricedAt: portfolio.pricedAt,
  };
}

/**
 * Fetch USD prices for a list of Sui coin types. Thin wrapper around
 * the engine's `fetchTokenPrices` (BlockVision price-list endpoint with
 * stable allow-list shortcut and 60s in-process cache). Same source as
 * `getPortfolio` so prices are always consistent across callers.
 */
export async function getTokenPrices(
  coinTypes: string[],
): Promise<Record<string, { price: number; change24h?: number }>> {
  return fetchTokenPrices(coinTypes, BLOCKVISION_API_KEY);
}

// Re-export the underlying types so adapters can use one import path.
export type {
  PortfolioCoin,
  AddressPortfolio,
  PositionSummary,
  SupplyEntry,
  BorrowEntry,
  DefiSummary,
};
