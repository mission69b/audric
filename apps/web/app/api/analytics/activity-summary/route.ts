import { NextRequest, NextResponse } from 'next/server';
import { fetchActivitySummary } from '@/lib/activity-data';
import { authenticateRequest, assertOwnsOrWatched } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/activity-summary?period=month&address=0x...
 * Header: x-zklogin-jwt (required — SPEC 30 Phase 1A.5)
 * Query: address (read target — optional; defaults to caller)
 *
 * Returns categorised activity breakdown from AppEvent + on-chain
 * transactions. The query-string `address` lets the engine's
 * `activity_summary` tool fetch a watched / saved-contact address
 * without spoofing the caller header (v0.49 universal address-aware
 * reads).
 *
 * SPEC 30 Phase 1A.5: caller identity now proven via verified zkLogin
 * JWT (was forgeable `x-sui-address` header). Watched-address reads
 * still allowed when the target is in the caller's `WatchAddress`
 * watchlist.
 */
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') ?? 'month';

  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address') ?? auth.verified.suiAddress;
  const ownership = await assertOwnsOrWatched(auth.verified, address);
  if (ownership) return ownership;

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
