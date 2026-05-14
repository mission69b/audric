import { NextRequest, NextResponse } from 'next/server';
import { fetchActivityBuckets } from '@/lib/activity-data';
import { authenticateRequest, assertOwnsOrWatched } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/activity-heatmap?days=365
 * Header: x-zklogin-jwt (required — SPEC 30 Phase 1A.5)
 * Query: address (read target — optional; defaults to caller)
 *
 * Returns daily activity counts from AppEvent + on-chain transactions.
 * Used by ActivityHeatmapCanvas for the GitHub-style contribution grid.
 *
 * SPEC 30 Phase 1A.5: caller identity now proven via verified zkLogin
 * JWT (was forgeable `x-sui-address` header). Watched-address reads
 * still allowed when the target is in the caller's `WatchAddress`
 * watchlist.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = Math.min(parseInt(searchParams.get('days') ?? '365', 10), 365);

  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;
  const address = searchParams.get('address') ?? auth.verified.suiAddress;
  if (!address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  const ownership = await assertOwnsOrWatched(auth.verified, address);
  if (ownership) return ownership;

  try {
    const buckets = await fetchActivityBuckets(address, days);

    const totalEvents = buckets.reduce((s, d) => s + d.count, 0);
    const activeDays = buckets.filter((d) => d.count > 0).length;
    const maxCount = buckets.reduce((m, d) => Math.max(m, d.count), 0);

    return NextResponse.json({
      address,
      days,
      buckets,
      summary: { totalEvents, activeDays, maxCount, periodDays: days },
    });
  } catch (err) {
    console.error('[activity-heatmap] Error:', err);
    return NextResponse.json({ address, days, buckets: [], summary: { totalEvents: 0, activeDays: 0, maxCount: 0, periodDays: days } });
  }
}
