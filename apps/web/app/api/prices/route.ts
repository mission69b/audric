import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEFILLAMA_URL = 'https://coins.llama.fi/prices/current';

interface PriceCache {
  prices: Record<string, number>;
  expiresAt: number;
}

const CACHE_TTL = 30_000;
let cache: PriceCache | null = null;

/**
 * GET /api/prices?coins=0x2::sui::SUI,0x...::usdc::USDC,...
 *
 * Returns USD prices for Sui coin types via DefiLlama.
 * If no coins param provided, fetches common tokens.
 * Cached server-side for 30s.
 */
export async function GET(request: NextRequest) {
  try {
    const coinsParam = request.nextUrl.searchParams.get('coins');

    const coinTypes = coinsParam
      ? coinsParam.split(',').filter(Boolean)
      : [
          '0x2::sui::SUI',
          '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
          '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
        ];

    if (cache && cache.expiresAt > Date.now()) {
      const allHit = coinTypes.every((ct) => ct in cache!.prices);
      if (allHit) {
        return NextResponse.json({ prices: cache.prices, decimals: {} }, {
          headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
        });
      }
    }

    const llamaCoins = coinTypes.map((ct) => `sui:${ct}`).join(',');
    const res = await fetch(`${DEFILLAMA_URL}/${encodeURIComponent(llamaCoins)}`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);

    const json = (await res.json()) as {
      coins?: Record<string, { price: number; symbol?: string; decimals?: number }>;
    };

    const prices: Record<string, number> = { USDC: 1, USDT: 1 };
    const decimalsMap: Record<string, number> = {};

    if (json.coins) {
      for (const [key, val] of Object.entries(json.coins)) {
        const coinType = key.replace(/^sui:/, '');
        prices[coinType] = val.price;
        if (val.symbol) {
          prices[val.symbol] = val.price;
        }
        if ('decimals' in val && typeof val.decimals === 'number') {
          decimalsMap[coinType] = val.decimals;
        }
      }
    }

    cache = { prices, expiresAt: Date.now() + CACHE_TTL };

    return NextResponse.json({ prices, decimals: decimalsMap }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[prices] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { prices: cache?.prices ?? { USDC: 1, USDT: 1 }, decimals: {} },
      { status: 200 },
    );
  }
}
