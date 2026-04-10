import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/portfolio-history?days=30
 *
 * Returns daily portfolio snapshots for the authenticated user (via x-sui-address header),
 * plus period change calculations.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 365);

  const address = request.headers.get('x-sui-address');
  if (!address) {
    return NextResponse.json({ error: 'Missing x-sui-address header' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        netWorthUsd: true,
        walletValueUsd: true,
        savingsValueUsd: true,
        debtValueUsd: true,
        yieldEarnedUsd: true,
        healthFactor: true,
      },
    });

    const mapped = snapshots.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      netWorthUsd: s.netWorthUsd,
      walletValueUsd: s.walletValueUsd,
      savingsValueUsd: s.savingsValueUsd,
      debtValueUsd: s.debtValueUsd,
      yieldEarnedUsd: s.yieldEarnedUsd,
      healthFactor: s.healthFactor,
    }));

    const change = computeChange(mapped, days);

    return NextResponse.json({ snapshots: mapped, change });
  } catch (err) {
    console.error('[portfolio-history] Error:', err);
    return NextResponse.json({
      snapshots: [],
      change: { period: `${days}d`, absoluteUsd: 0, percentChange: 0 },
    });
  }
}

function computeChange(
  snapshots: { netWorthUsd: number }[],
  days: number,
): { period: string; absoluteUsd: number; percentChange: number } {
  if (snapshots.length < 2) {
    return { period: `${days}d`, absoluteUsd: 0, percentChange: 0 };
  }

  const first = snapshots[0].netWorthUsd;
  const last = snapshots[snapshots.length - 1].netWorthUsd;
  const absoluteUsd = last - first;
  const percentChange = first > 0 ? ((last - first) / first) * 100 : 0;

  return { period: `${days}d`, absoluteUsd, percentChange };
}
