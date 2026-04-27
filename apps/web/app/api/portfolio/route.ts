import { NextRequest, NextResponse } from 'next/server';
import { fetchPortfolio } from '@/lib/portfolio-data';
import { isValidSuiAddress } from '@mysten/sui/utils';

export const runtime = 'nodejs';

/**
 * GET /api/portfolio?address=0x...
 *
 * Single source of truth for "what is this wallet worth right now".
 * Backed by `fetchPortfolio()` (wallet balances + lending positions +
 * derived net worth + estimated daily yield), the same function used by
 * the daily portfolio snapshot cron and the portfolio-history fallback.
 *
 * Why this exists:
 * Pre-fix, individual canvases stitched together /api/balances +
 * engine-seeded position data, which produced inconsistent numbers
 * across surfaces (e.g. full_portfolio showed $0 savings for watched
 * addresses while portfolio_timeline showed the correct value, because
 * the engine only seeds `serverPositions` for the signed-in user). All
 * portfolio canvases should pull from this endpoint instead so the
 * wallet/savings/debt/net-worth numbers stay consistent regardless of
 * whether the address is the user's own or a watched one.
 *
 * Address-aware: works for any Sui wallet, not just the signed-in user.
 * Cached briefly at the edge to absorb canvas refresh storms.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const portfolio = await fetchPortfolio(address);

    return NextResponse.json({
      address,
      netWorthUsd: portfolio.netWorthUsd,
      walletValueUsd: portfolio.wallet.totalUsd,
      walletAllocations: portfolio.wallet.allocations,
      wallet: {
        SUI: portfolio.wallet.SUI,
        USDC: portfolio.wallet.USDC,
        USDsui: portfolio.wallet.USDsui,
        assets: portfolio.wallet.assets,
      },
      positions: {
        savings: portfolio.positions.savings,
        borrows: portfolio.positions.borrows,
        savingsRate: portfolio.positions.savingsRate,
        healthFactor: portfolio.positions.healthFactor,
        maxBorrow: portfolio.positions.maxBorrow,
        pendingRewards: portfolio.positions.pendingRewards,
      },
      estimatedDailyYield: portfolio.estimatedDailyYield,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[portfolio] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
  }
}
