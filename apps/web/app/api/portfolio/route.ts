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
        // [Bug — 2026-04-28] DeFi values were stripped from this route's
        // response BEFORE this fix, even though `getPortfolio()` returned
        // them. That meant FullPortfolioCanvas (the only direct consumer
        // of `/api/portfolio`) could never render a DeFi row, so a
        // wallet with $7,520 in Bluefin+Suilend showed as $29,641
        // instead of $37,160 — silently dropping the same DeFi line
        // `balance_check` reported correctly. Surfacing both the value
        // and the source lets the canvas caveat partial/degraded reads
        // (cf. BalanceCard's "DeFi —" placeholder pattern).
        defiValueUsd: portfolio.defiValueUsd,
        defiSource: portfolio.defiSource,
        // [Bug — 2026-04-28] Forward DeFi pricedAt so FullPortfolioCanvas
        // can render "cached Nm ago" when source === 'partial-stale'.
        // Pre-fix the route stripped this and the canvas's `defiIsStale`
        // branch silently fell through to the no-pricedAt fallback.
        defiPricedAt: portfolio.defiPricedAt,
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
