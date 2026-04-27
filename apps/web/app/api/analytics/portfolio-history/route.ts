import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPortfolio } from '@/lib/portfolio';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/portfolio-history?days=30&address=0x...
 *
 * Returns daily portfolio snapshots for the requested address plus
 * period change calculations. Falls back to a single live data point
 * (via the canonical `getPortfolio()`) when no historical snapshot
 * row exists for today (e.g. cron hasn't run, or the target is a
 * watched address that isn't a registered Audric user).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 365);

  const callerAddress = request.headers.get('x-sui-address');
  const queryAddress = searchParams.get('address');
  if (!callerAddress) {
    return NextResponse.json({ error: 'Missing x-sui-address header' }, { status: 401 });
  }
  const address = queryAddress ?? callerAddress;

  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    // For watched-address reads where the target isn't a registered
    // Audric user, `user` is null — we skip the historical query and
    // synthesize a single live data point below. The snapshot table
    // is keyed by Audric userId, not arbitrary wallet addresses.
    const snapshots = user
      ? await prisma.portfolioSnapshot.findMany({
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
        })
      : [];

    const mapped = snapshots.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      netWorthUsd: s.netWorthUsd,
      walletValueUsd: s.walletValueUsd,
      savingsValueUsd: s.savingsValueUsd,
      debtValueUsd: s.debtValueUsd,
      yieldEarnedUsd: s.yieldEarnedUsd,
      healthFactor: s.healthFactor,
    }));

    const todayStr = new Date().toISOString().slice(0, 10);
    const lastSnapshot = mapped[mapped.length - 1];
    const needsLivePoint = !lastSnapshot || lastSnapshot.date !== todayStr;

    if (needsLivePoint) {
      try {
        const portfolio = await getPortfolio(address);
        mapped.push({
          date: todayStr,
          netWorthUsd: portfolio.netWorthUsd,
          walletValueUsd: portfolio.walletValueUsd,
          savingsValueUsd: portfolio.positions.savings,
          debtValueUsd: portfolio.positions.borrows,
          yieldEarnedUsd: 0,
          healthFactor: portfolio.positions.healthFactor,
        });
      } catch { /* stale data is better than crash */ }
    }

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
