import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPortfolio } from '@/lib/portfolio';
import { authenticateAnalyticsRequest } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/yield-summary?address=0x...
 * Header: x-internal-key (engine + cron) OR x-zklogin-jwt (browser)
 * Query: address (read target — required for internal-key path;
 *                 optional for JWT path where it defaults to caller)
 *
 * Returns yield earnings breakdown: today, week, month, all-time,
 * current APY, deposited amount, projected yearly, and monthly sparkline.
 *
 * Uses PortfolioSnapshot for historical data and live position data
 * from the protocol registry for current state.
 *
 * [v0.49] Address-aware: a watched / saved-contact address is allowed
 * via `?address=` even though the caller is the signed-in user. When
 * the target isn't an Audric user the historical snapshot path is
 * skipped (no rows) and we report live-only state from the protocol
 * registry — yieldToday/Week/Month/AllTime stay 0 for non-Audric
 * users (we have no record of past yield), but currentApy + deposited
 * + projectedYear come straight from the live position.
 *
 * SPEC 30 Phase 1A.5: caller identity is proven via verified zkLogin
 * JWT (was forgeable `x-sui-address` header). Watched-address reads
 * still allowed when the target is in the caller's `WatchAddress`
 * watchlist.
 *
 * Day 20d: dual-auth via `authenticateAnalyticsRequest()` so the
 * engine's `yield_summary` tool can pull this server-side. See
 * `lib/internal-auth.ts` for the helper + security rationale.
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

    const now = new Date();

    // Watched-address fallback: when the target isn't a registered
    // Audric user we don't have snapshot rows. We still want to
    // return live state, so we proceed with an empty snapshot list.
    const snapshots = user
      ? await prisma.portfolioSnapshot.findMany({
          where: { userId: user.id },
          orderBy: { date: 'asc' },
          select: {
            date: true,
            savingsValueUsd: true,
            yieldEarnedUsd: true,
            healthFactor: true,
          },
        })
      : [];

    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

    let yieldToday = 0;
    let yieldWeek = 0;
    let yieldMonth = 0;
    let yieldAllTime = 0;
    let currentSavings = 0;
    let currentApy = 0;

    for (const s of snapshots) {
      const dateStr = s.date.toISOString().slice(0, 10);
      const earned = s.yieldEarnedUsd ?? 0;
      yieldAllTime += earned;

      if (dateStr === todayStr) yieldToday += earned;
      if (s.date >= weekAgo) yieldWeek += earned;
      if (s.date >= monthAgo) yieldMonth += earned;
    }

    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      currentSavings = latest.savingsValueUsd ?? 0;
    }

    const livePortfolio = await getPortfolio(address);
    const liveSavings = livePortfolio.positions.savings;
    const liveRate = livePortfolio.positions.savingsRate;

    if (liveSavings > currentSavings || currentSavings === 0) {
      currentSavings = liveSavings;
    }

    const hasRealYieldData = snapshots.some((s) => (s.yieldEarnedUsd ?? 0) > 0);
    if (hasRealYieldData && currentSavings > 0 && snapshots.length >= 7) {
      const recentWeekYield = yieldWeek;
      const dailyAvg = recentWeekYield / Math.min(snapshots.length, 7);
      currentApy = currentSavings > 0 ? (dailyAvg / currentSavings) * 365 : 0;
    }

    if (currentApy <= 0 && currentSavings > 0) {
      currentApy = liveRate > 0 ? liveRate : 0.045;
      yieldToday = currentSavings * currentApy / 365;
    }

    const projectedYear = currentSavings * (currentApy > 0 ? currentApy : 0.045);

    const sparkline: number[] = [];
    const monthBuckets = new Map<string, number>();
    for (const s of snapshots) {
      const monthKey = s.date.toISOString().slice(0, 7);
      monthBuckets.set(monthKey, (monthBuckets.get(monthKey) ?? 0) + (s.yieldEarnedUsd ?? 0));
    }
    const sortedMonths = [...monthBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, total] of sortedMonths.slice(-12)) {
      sparkline.push(Math.round(total * 100) / 100);
    }

    return NextResponse.json({
      today: Math.round(yieldToday * 10000) / 10000,
      thisWeek: Math.round(yieldWeek * 100) / 100,
      thisMonth: Math.round(yieldMonth * 100) / 100,
      allTime: Math.round(yieldAllTime * 100) / 100,
      currentApy,
      deposited: Math.round(currentSavings * 100) / 100,
      projectedYear: Math.round(projectedYear * 100) / 100,
      sparkline,
    });
  } catch (err) {
    console.error('[yield-summary] Error:', err);
    return NextResponse.json({
      today: 0, thisWeek: 0, thisMonth: 0, allTime: 0,
      currentApy: 0, deposited: 0, projectedYear: 0, sparkline: [],
    });
  }
}
