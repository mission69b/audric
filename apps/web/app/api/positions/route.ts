import { NextRequest, NextResponse } from 'next/server';
import { fetchPositions } from '@/lib/portfolio-data';

export const runtime = 'nodejs';

/**
 * GET /api/positions?address=0x...
 *
 * Returns savings, borrows, rates, health factor, and max borrow across all lending protocols.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const pos = await fetchPositions(address);

  return NextResponse.json({
    savings: pos.savings,
    borrows: pos.borrows,
    savingsRate: pos.savingsRate,
    healthFactor: pos.healthFactor,
    maxBorrow: pos.maxBorrow,
    pendingRewards: pos.pendingRewards,
    supplies: pos.supplies,
    borrows_detail: pos.borrowsDetail,
  });
}
