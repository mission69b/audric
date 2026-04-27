// ---------------------------------------------------------------------------
// Canonical rates fetcher — SINGLE SOURCE OF TRUTH for "what are the
// current save/borrow APYs across all protocols". `/api/rates`,
// `lib/product-stats.ts`, the `rates_info` engine tool, and any future
// rate-aware UI all go through this module.
//
// See [.cursor/rules/single-source-of-truth.mdc].
// ---------------------------------------------------------------------------

import { getRegistry } from '@/lib/protocol-registry';

export interface RateEntry {
  protocol: string;
  protocolId: string;
  asset: string;
  saveApy: number;
  borrowApy: number;
}

export interface BestSaveRate {
  protocol: string;
  protocolId: string;
  asset: string;
  rate: number;
}

export interface RatesSummary {
  /** Every (protocol, asset) pair we currently know about. */
  rates: RateEntry[];
  /** USDC-specific subset (legacy convenience for `rates_info` etc). */
  usdcRates: RateEntry[];
  /** Best USDC save APY across all integrated protocols. */
  bestSaveRate: BestSaveRate | null;
  /** Best USDC borrow APY (lowest non-zero rate). */
  bestBorrowRate: BestSaveRate | null;
}

interface RatesCacheEntry {
  data: RatesSummary;
  expiresAt: number;
}

const RATES_CACHE_TTL = 30_000;
let ratesCache: RatesCacheEntry | null = null;

/**
 * Fetch every save/borrow rate exposed by the protocol registry.
 *
 * Cached for 30s in-process. Pulls from the same `getRegistry()`
 * instance that the lending tools use, so quoted rates always match
 * what the user would actually receive on-chain.
 */
export async function getRates(): Promise<RatesSummary> {
  if (ratesCache && ratesCache.expiresAt > Date.now()) {
    return ratesCache.data;
  }

  const registry = getRegistry();

  let rates: RateEntry[] = [];
  try {
    const all = await registry.allRatesAcrossAssets();
    rates = all.map((r) => ({
      protocol: r.protocol,
      protocolId: r.protocolId,
      asset: r.asset,
      saveApy: r.rates.saveApy,
      borrowApy: r.rates.borrowApy,
    }));
  } catch (err) {
    console.error('[rates] allRatesAcrossAssets failed:', err);
  }

  const usdcRates = rates.filter((r) => r.asset === 'USDC');

  let bestSaveRate: BestSaveRate | null = null;
  let bestBorrowRate: BestSaveRate | null = null;
  for (const r of usdcRates) {
    if (!bestSaveRate || r.saveApy > bestSaveRate.rate) {
      bestSaveRate = { protocol: r.protocol, protocolId: r.protocolId, asset: r.asset, rate: r.saveApy };
    }
    if (r.borrowApy > 0 && (!bestBorrowRate || r.borrowApy < bestBorrowRate.rate)) {
      bestBorrowRate = { protocol: r.protocol, protocolId: r.protocolId, asset: r.asset, rate: r.borrowApy };
    }
  }

  const summary: RatesSummary = { rates, usdcRates, bestSaveRate, bestBorrowRate };
  ratesCache = { data: summary, expiresAt: Date.now() + RATES_CACHE_TTL };

  return summary;
}

/**
 * Force-evict the in-process rate cache. Useful after a known protocol
 * config change or for tests.
 */
export function invalidateRatesCache(): void {
  ratesCache = null;
}
