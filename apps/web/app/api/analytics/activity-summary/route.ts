import { NextRequest, NextResponse } from 'next/server';
import { fetchActivitySummary } from '@/lib/activity-data';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/activity-summary?period=month&address=0x...
 * Header: x-sui-address (caller identity — required)
 * Query: address (read target — optional; defaults to caller)
 *
 * Returns categorised activity breakdown from AppEvent + on-chain
 * transactions. The query-string `address` lets the engine's
 * `activity_summary` tool fetch a watched / saved-contact address
 * without spoofing the caller header (v0.49 universal address-aware
 * reads).
 */
export async function GET(request: NextRequest) {
  const callerAddress = request.headers.get('x-sui-address');
  const queryAddress = request.nextUrl.searchParams.get('address');
  const period = request.nextUrl.searchParams.get('period') ?? 'month';

  // Caller identity is still required so we don't accept fully
  // unauthenticated reads. The read target is the query-string address
  // when present, otherwise falls back to the caller's own.
  if (!callerAddress) {
    return NextResponse.json({ error: 'Missing x-sui-address header' }, { status: 401 });
  }

  const address = queryAddress ?? callerAddress;

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
