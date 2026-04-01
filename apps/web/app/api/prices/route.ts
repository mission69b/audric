import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const NAVI_POOLS_URL = 'https://open-api.naviprotocol.io/api/navi/pools?env=prod&market=main';

interface PriceCache {
  prices: Record<string, number>;
  expiresAt: number;
}

const CACHE_TTL = 30_000;
let cache: PriceCache | null = null;

const SYMBOL_MAP: Record<string, string> = {
  SUI: '0x2::sui::SUI',
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
};

async function fetchPrices(): Promise<Record<string, number>> {
  if (cache && cache.expiresAt > Date.now()) return cache.prices;

  const res = await fetch(NAVI_POOLS_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`NAVI API ${res.status}`);

  const { data: pools } = (await res.json()) as {
    data: Array<{ suiCoinType: string; token: { symbol: string }; oracle: { price: number } }>;
  };

  const prices: Record<string, number> = { USDC: 1, USDT: 1 };

  for (const [symbol, coinType] of Object.entries(SYMBOL_MAP)) {
    const pool = pools.find((p) => p.suiCoinType === coinType);
    if (pool?.oracle?.price) {
      prices[symbol] = pool.oracle.price;
    }
  }

  cache = { prices, expiresAt: Date.now() + CACHE_TTL };
  return prices;
}

/**
 * GET /api/prices
 *
 * Returns USD prices for supported assets via NAVI oracle data.
 * Cached server-side for 30s.
 */
export async function GET() {
  try {
    const prices = await fetchPrices();
    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[prices] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { SUI: 0, USDC: 1, USDT: 1 },
      { status: 200 },
    );
  }
}
