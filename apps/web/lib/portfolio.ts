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
 */
export async function getPortfolio(address: string): Promise<Portfolio> {
  // Three independent reads in parallel. Each degrades to an empty/zero
  // shape on failure rather than throwing, so the canonical fetcher
  // never crashes a caller because one upstream is down. balance_check
  // uses the same allSettled-then-zero pattern.
  const [walletResult, positionsResult, defiResult] = await Promise.allSettled([
    fetchAddressPortfolio(address, BLOCKVISION_API_KEY, getSuiRpcUrl()),
    fetchPositions(address),
    fetchAddressDefiPortfolio(address, BLOCKVISION_API_KEY),
  ]);

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

  if (walletResult.status === 'rejected') {
    console.error(`[portfolio] wallet fetch failed for ${address}:`, walletResult.reason);
  }
  if (positionsResult.status === 'rejected') {
    console.error(`[portfolio] positions fetch failed for ${address}:`, positionsResult.reason);
  }
  if (defiResult.status === 'rejected') {
    console.error(`[portfolio] defi fetch failed for ${address}:`, defiResult.reason);
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
