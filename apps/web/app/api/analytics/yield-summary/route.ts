import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const SELF_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.AUDRIC_INTERNAL_URL ?? 'http://localhost:3000';

/**
 * GET /api/analytics/yield-summary?address=0x...
 *
 * Returns yield earnings breakdown: today, week, month, all-time,
 * current APY, deposited amount, projected yearly, and monthly sparkline.
 *
 * Uses PortfolioSnapshot for historical data and derives daily yield
 * from savings balance * APY / 365.
 */
export async function GET(request: NextRequest) {
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

    const now = new Date();

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        savingsValueUsd: true,
        yieldEarnedUsd: true,
        healthFactor: true,
      },
    });

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

    // Fetch live position data for accurate current values
    let liveSavings = currentSavings;
    let liveRate = 0;
    try {
      const posRes = await fetch(`${SELF_URL}/api/positions?address=${address}`);
      if (posRes.ok) {
        const posData = (await posRes.json()) as { savings?: number; savingsRate?: number };
        if (posData.savings != null) liveSavings = posData.savings;
        if (posData.savingsRate != null) liveRate = posData.savingsRate;
      }
    } catch { /* fall through to snapshot-based values */ }

    if (liveSavings > currentSavings || currentSavings === 0) {
      currentSavings = liveSavings;
    }

    // Derive APY from recent yield if we have enough snapshots with real yield data
    const hasRealYieldData = snapshots.some((s) => (s.yieldEarnedUsd ?? 0) > 0);
    if (hasRealYieldData && currentSavings > 0 && snapshots.length >= 7) {
      const recentWeekYield = yieldWeek;
      const dailyAvg = recentWeekYield / Math.min(snapshots.length, 7);
      currentApy = currentSavings > 0 ? (dailyAvg / currentSavings) * 365 : 0;
    }

    // Use live rate from protocol if available, otherwise default
    if (currentApy <= 0 && currentSavings > 0) {
      currentApy = liveRate > 0 ? liveRate : 0.045;
      yieldToday = currentSavings * currentApy / 365;
    }

    const projectedYear = currentSavings * (currentApy > 0 ? currentApy : 0.045);

    // Build monthly sparkline (last 12 months of cumulative yield)
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
