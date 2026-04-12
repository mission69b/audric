import { NextRequest, NextResponse } from 'next/server';
import { fetchActivityBuckets } from '@/lib/activity-data';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/activity-heatmap?days=365
 * Header: x-sui-address
 *
 * Returns daily activity counts from AppEvent + on-chain transactions.
 * Used by ActivityHeatmapCanvas for the GitHub-style contribution grid.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const address = request.headers.get('x-sui-address')
    ?? searchParams.get('address');
  const days = Math.min(parseInt(searchParams.get('days') ?? '365', 10), 365);

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

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
