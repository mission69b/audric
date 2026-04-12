import { NextRequest, NextResponse } from 'next/server';
import { fetchWalletBalances } from '@/lib/portfolio-data';

export const runtime = 'nodejs';

/**
 * GET /api/balances?address=0x...
 *
 * Returns raw token balances for SUI, USDC, and tradeable assets.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const bal = await fetchWalletBalances(address);

    return NextResponse.json({
      SUI: bal.SUI,
      USDC: bal.USDC,
      ...Object.fromEntries(
        Object.entries(bal.assets).map(([k, v]) => [k, v]),
      ),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[balances] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 });
  }
}
