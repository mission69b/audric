import { NextRequest, NextResponse } from 'next/server';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { getPortfolio } from '@/lib/portfolio';
import { authenticateRequest, assertOwnsOrWatched } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/positions?address=0x...
 * Header: x-zklogin-jwt (required — SPEC 30 Phase 1A.5)
 *
 * Returns NAVI savings, borrows, rates, health factor, and max borrow.
 * Thin adapter around `getPortfolio()` — fetches the full canonical
 * portfolio and returns only the positions slice.
 *
 * SPEC 30 Phase 1A.5: caller must hold a valid zkLogin JWT. The
 * `?address=` parameter must either equal the caller's own address or
 * be in their `WatchAddress` watchlist.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;
  const ownership = await assertOwnsOrWatched(auth.verified, address);
  if (ownership) return ownership;

  try {
    const { positions } = await getPortfolio(address);

    return NextResponse.json({
      savings: positions.savings,
      borrows: positions.borrows,
      savingsRate: positions.savingsRate,
      healthFactor: positions.healthFactor,
      maxBorrow: positions.maxBorrow,
      pendingRewards: positions.pendingRewards,
      supplies: positions.supplies,
      borrows_detail: positions.borrowsDetail,
    });
  } catch (err) {
    console.error('[positions] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}
