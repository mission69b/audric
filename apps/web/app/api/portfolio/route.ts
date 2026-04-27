import { NextRequest, NextResponse } from 'next/server';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { getPortfolio } from '@/lib/portfolio';

export const runtime = 'nodejs';

/**
 * GET /api/portfolio?address=0x...
 *
 * Single source of truth for "what is this wallet worth right now".
 * Thin adapter around `getPortfolio()` (see [/Users/funkii/dev/audric/apps/web/lib/portfolio.ts]).
 *
 * Returns the canonical {@link Portfolio} shape directly — wallet
 * coins (priced), per-symbol allocations, NAVI positions, derived net
 * worth, estimated daily yield, source flag, and price timestamp.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const portfolio = await getPortfolio(address);

    return NextResponse.json(
      {
        address: portfolio.address,
        netWorthUsd: portfolio.netWorthUsd,
        walletValueUsd: portfolio.walletValueUsd,
        walletAllocations: portfolio.walletAllocations,
        wallet: portfolio.wallet,
        positions: {
          savings: portfolio.positions.savings,
          borrows: portfolio.positions.borrows,
          savingsRate: portfolio.positions.savingsRate,
          healthFactor: portfolio.positions.healthFactor,
          maxBorrow: portfolio.positions.maxBorrow,
          pendingRewards: portfolio.positions.pendingRewards,
          supplies: portfolio.positions.supplies,
          borrowsDetail: portfolio.positions.borrowsDetail,
        },
        estimatedDailyYield: portfolio.estimatedDailyYield,
        source: portfolio.source,
        pricedAt: portfolio.pricedAt,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
    );
  } catch (err) {
    console.error('[portfolio] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
  }
}
