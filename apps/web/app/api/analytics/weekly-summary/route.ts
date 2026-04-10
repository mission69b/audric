import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const INTERNAL_KEY = process.env.AUDRIC_INTERNAL_KEY ?? '';

/**
 * GET /api/analytics/weekly-summary?address=0x...
 *
 * Returns a 7-day summary for the weekly briefing email (FI-3).
 * Called by the t2000 cron job via internal key auth or by
 * authenticated users via x-sui-address header.
 */
export async function GET(request: NextRequest) {
  const internalKey = request.headers.get('x-internal-key');
  const address = request.nextUrl.searchParams.get('address') ?? request.headers.get('x-sui-address');

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  if (!internalKey || internalKey !== INTERNAL_KEY) {
    const headerAddr = request.headers.get('x-sui-address');
    if (!headerAddr || headerAddr !== address) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

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
