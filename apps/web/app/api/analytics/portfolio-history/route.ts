import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClient, getRegistry } from '@/lib/protocol-registry';
import { USDC_TYPE } from '@t2000/sdk';

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

    const todayStr = new Date().toISOString().slice(0, 10);
    const lastSnapshot = mapped[mapped.length - 1];
    const needsLivePoint = !lastSnapshot || lastSnapshot.date !== todayStr;

    if (needsLivePoint) {
      try {
        const client = getClient();
        const registry = getRegistry();

        const [usdcBal, positions] = await Promise.all([
          client.getBalance({ owner: address, coinType: USDC_TYPE }).catch(() => null),
          registry.allPositions(address).catch(() => []),
        ]);

        const walletUsd = usdcBal ? Number(BigInt(usdcBal.totalBalance)) / 1e6 : 0;
        let savingsUsd = 0;
        let debtUsd = 0;
        let healthFactor: number | null = null;

        for (const pos of positions) {
          for (const s of pos.positions.supplies) savingsUsd += s.amountUsd ?? s.amount;
          for (const b of pos.positions.borrows) debtUsd += b.amountUsd ?? b.amount;
        }

        try {
          const healths = await Promise.all(
            registry.listLending().map((a) => a.getHealth(address).catch(() => null)),
          );
          const finite = healths.filter((h): h is NonNullable<typeof h> =>
            h != null && isFinite(h.healthFactor) && h.healthFactor !== Infinity,
          );
          if (finite.length > 0) healthFactor = Math.min(...finite.map((h) => h.healthFactor));
        } catch { /* health is supplementary */ }

        mapped.push({
          date: todayStr,
          netWorthUsd: walletUsd + savingsUsd - debtUsd,
          walletValueUsd: walletUsd,
          savingsValueUsd: savingsUsd,
          debtValueUsd: debtUsd,
          yieldEarnedUsd: 0,
          healthFactor,
        });
      } catch { /* fall through -- stale data is better than crash */ }
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
