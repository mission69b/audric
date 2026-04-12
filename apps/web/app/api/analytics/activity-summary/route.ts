import { NextRequest, NextResponse } from 'next/server';
import { fetchActivitySummary } from '@/lib/activity-data';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/activity-summary?period=month
 * Header: x-sui-address
 *
 * Returns categorised activity breakdown from AppEvent + on-chain transactions.
 */
export async function GET(request: NextRequest) {
  const address = request.headers.get('x-sui-address');
  const period = request.nextUrl.searchParams.get('period') ?? 'month';

  if (!address) {
    return NextResponse.json({ error: 'Missing x-sui-address header' }, { status: 401 });
  }

  try {
    const summary = await fetchActivitySummary(address, period);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[activity-summary] Error:', err);
    return NextResponse.json({
      period,
      totalTransactions: 0,
      byAction: [],
      totalMovedUsd: 0,
      netSavingsUsd: 0,
      yieldEarnedUsd: 0,
    });
  }
}
