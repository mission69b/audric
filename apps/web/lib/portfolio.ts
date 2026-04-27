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

import { fetchAddressPortfolio, fetchTokenPrices, type AddressPortfolio, type PortfolioCoin } from '@t2000/engine';
import {
  fetchPositions,
  type PositionSummary,
  type SupplyEntry,
  type BorrowEntry,
} from '@/lib/portfolio-data';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

const BLOCKVISION_API_KEY = process.env.BLOCKVISION_API_KEY;

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
  /** `walletValueUsd + positions.savings - positions.borrows`. */
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
  const [walletResult, positionsResult] = await Promise.allSettled([
    fetchAddressPortfolio(address, BLOCKVISION_API_KEY, getSuiRpcUrl()),
    fetchPositions(address),
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

  if (walletResult.status === 'rejected') {
    console.error(`[portfolio] wallet fetch failed for ${address}:`, walletResult.reason);
  }
  if (positionsResult.status === 'rejected') {
    console.error(`[portfolio] positions fetch failed for ${address}:`, positionsResult.reason);
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

  const netWorthUsd = walletPortfolio.totalUsd + positions.savings - positions.borrows;
  const estimatedDailyYield = positions.savings > 0 && positions.savingsRate > 0
    ? Math.max(0, (positions.savings * positions.savingsRate) / 365)
    : 0;

  return {
    address,
    wallet: walletPortfolio.coins,
    walletValueUsd: walletPortfolio.totalUsd,
    walletAllocations,
    positions,
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
export type { PortfolioCoin, AddressPortfolio, PositionSummary, SupplyEntry, BorrowEntry };
