import { NextRequest, NextResponse } from 'next/server';
import { getTokenPrices } from '@/lib/portfolio';

export const runtime = 'nodejs';

const HEADERS = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' };

const DEFAULT_COINS = [
  '0x2::sui::SUI',
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
];

/**
 * GET /api/prices?coins=0x2::sui::SUI,...
 *
 * Returns USD prices for a list of Sui coin types.
 * Thin adapter around `getTokenPrices()` — wraps the canonical
 * BlockVision-backed price feed and surfaces the legacy
 * `{ prices, decimals }` wire shape consumers expect.
 *
 * `decimals` is intentionally empty: BlockVision's price endpoint
 * doesn't return decimals; callers that need decimal info should use
 * `/api/portfolio` (priced wallet has decimals per coin) or import
 * `TOKEN_MAP` from `@t2000/sdk`.
 */
export async function GET(request: NextRequest) {
  try {
    const coinsParam = request.nextUrl.searchParams.get('coins');
    const coinTypes = coinsParam ? coinsParam.split(',').filter(Boolean) : DEFAULT_COINS;

    const priced = await getTokenPrices(coinTypes);

    const prices: Record<string, number> = {};
    for (const [coinType, info] of Object.entries(priced)) {
      prices[coinType] = info.price;
    }

    return NextResponse.json({ prices, decimals: {} }, { headers: HEADERS });
  } catch (err) {
    console.error('[prices] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ prices: {}, decimals: {} }, { status: 200 });
  }
}
