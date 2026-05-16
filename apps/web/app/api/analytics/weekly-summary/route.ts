import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAnalyticsRequest } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/weekly-summary?address=0x...
 * Header: x-internal-key (for the t2000 cron) OR x-zklogin-jwt (for users)
 *
 * Returns a 7-day summary for the weekly briefing email (FI-3).
 * Called by the t2000 cron job via internal-key auth, or by
 * authenticated users via verified zkLogin JWT.
 *
 * SPEC 30 Phase 1A.5: user-facing branch hardened — was forgeable
 * `x-sui-address` header equality check, now full JWT verify +
 * `assertOwnsOrWatched` (so a user can pull a saved-contact's summary
 * but not arbitrary addresses).
 *
 * Day 20d: this route was the original canonical example of the
 * dual-auth pattern (inline); now consolidated through
 * `authenticateAnalyticsRequest()` so the 5 analytics routes share
 * one implementation.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAnalyticsRequest(request);
  if ('error' in auth) return auth.error;
  const { address } = auth;

  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [snapshots, events, purchases] = await Promise.all([
      prisma.portfolioSnapshot.findMany({
        where: { userId: user.id, date: { gte: weekAgo } },
        orderBy: { date: 'asc' },
        select: {
          netWorthUsd: true,
          yieldEarnedUsd: true,
        },
      }),
      prisma.appEvent.count({
        where: { address, createdAt: { gte: weekAgo } },
      }),
      prisma.servicePurchase.findMany({
        where: { address, createdAt: { gte: weekAgo } },
        select: { serviceId: true, amountUsd: true },
      }),
    ]);

    let netWorthChange = 0;
    let netWorthChangePct = 0;
    let currentNetWorth = 0;
    let yieldEarned = 0;

    if (snapshots.length >= 2) {
      const first = snapshots[0].netWorthUsd;
      const last = snapshots[snapshots.length - 1].netWorthUsd;
      netWorthChange = last - first;
      netWorthChangePct = first > 0 ? ((last - first) / first) * 100 : 0;
      currentNetWorth = last;
    } else if (snapshots.length === 1) {
      currentNetWorth = snapshots[0].netWorthUsd;
    }

    yieldEarned = snapshots.reduce((s, snap) => s + (snap.yieldEarnedUsd ?? 0), 0);

    const uniqueServices = new Set(purchases.map((p) => p.serviceId));
    const servicesCost = purchases.reduce((s, p) => s + p.amountUsd, 0);

    return NextResponse.json({
      netWorthChange: Math.round(netWorthChange * 100) / 100,
      netWorthChangePct: Math.round(netWorthChangePct * 10) / 10,
      yieldEarned: Math.round(yieldEarned * 100) / 100,
      transactionCount: events,
      servicesUsed: uniqueServices.size,
      servicesCost: Math.round(servicesCost * 100) / 100,
      currentNetWorth: Math.round(currentNetWorth * 100) / 100,
    });
  } catch (err) {
    console.error('[weekly-summary] Error:', err);
    return NextResponse.json({
      netWorthChange: 0, netWorthChangePct: 0, yieldEarned: 0,
      transactionCount: 0, servicesUsed: 0, servicesCost: 0, currentNetWorth: 0,
    });
  }
}
