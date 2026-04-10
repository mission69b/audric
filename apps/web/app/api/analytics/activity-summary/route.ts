import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const ACTION_LABELS: Record<string, string> = {
  save: 'Saves',
  withdraw: 'Withdrawals',
  send: 'Sends',
  borrow: 'Borrows',
  repay: 'Repayments',
  swap: 'Swaps',
  pay: 'Services',
  claim: 'Claims',
  stake: 'Stakes',
};

function periodToDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'week': return new Date(now.getTime() - 7 * 86_400_000);
    case 'month': return new Date(now.getTime() - 30 * 86_400_000);
    case 'year': return new Date(now.getTime() - 365 * 86_400_000);
    case 'all': return new Date(0);
    default: return new Date(now.getTime() - 30 * 86_400_000);
  }
}

/**
 * GET /api/analytics/activity-summary?address=0x...&period=month
 *
 * Returns categorised activity breakdown from AppEvent table.
 */
export async function GET(request: NextRequest) {
  const address = request.headers.get('x-sui-address');
  const period = request.nextUrl.searchParams.get('period') ?? 'month';

  if (!address) {
    return NextResponse.json({ error: 'Missing x-sui-address header' }, { status: 401 });
  }

  try {
    const since = periodToDate(period);

    const events = await prisma.appEvent.findMany({
      where: {
        address,
        createdAt: { gte: since },
      },
      select: {
        type: true,
        details: true,
      },
    });

    const actionMap = new Map<string, { count: number; totalAmountUsd: number }>();

    for (const e of events) {
      const action = normalizeAction(e.type);
      if (!action) continue;

      const entry = actionMap.get(action) ?? { count: 0, totalAmountUsd: 0 };
      entry.count++;

      const details = (e.details ?? {}) as Record<string, unknown>;
      const amount = typeof details.amountUsd === 'number' ? details.amountUsd
        : typeof details.amount === 'number' ? details.amount : 0;
      entry.totalAmountUsd += amount;

      actionMap.set(action, entry);
    }

    const byAction = [...actionMap.entries()]
      .map(([action, data]) => ({
        action: ACTION_LABELS[action] ?? action,
        count: data.count,
        totalAmountUsd: Math.round(data.totalAmountUsd * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count);

    const totalTransactions = byAction.reduce((s, a) => s + a.count, 0);
    const totalMovedUsd = byAction.reduce((s, a) => s + a.totalAmountUsd, 0);

    const saves = actionMap.get('save')?.totalAmountUsd ?? 0;
    const withdrawals = actionMap.get('withdraw')?.totalAmountUsd ?? 0;
    const netSavingsUsd = saves - withdrawals;

    // Get yield from snapshots if available
    let yieldEarnedUsd = 0;
    try {
      const user = await prisma.user.findUnique({
        where: { suiAddress: address },
        select: { id: true },
      });
      if (user) {
        const yieldSnaps = await prisma.portfolioSnapshot.findMany({
          where: { userId: user.id, date: { gte: since } },
          select: { yieldEarnedUsd: true },
        });
        yieldEarnedUsd = yieldSnaps.reduce((s, snap) => s + (snap.yieldEarnedUsd ?? 0), 0);
      }
    } catch {
      // yield is supplementary
    }

    return NextResponse.json({
      period,
      totalTransactions,
      byAction,
      totalMovedUsd: Math.round(totalMovedUsd * 100) / 100,
      netSavingsUsd: Math.round(netSavingsUsd * 100) / 100,
      yieldEarnedUsd: Math.round(yieldEarnedUsd * 100) / 100,
    });
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

function normalizeAction(type: string): string | null {
  const t = type.toLowerCase();
  if (t.includes('save') || t.includes('deposit')) return 'save';
  if (t.includes('withdraw')) return 'withdraw';
  if (t.includes('send') || t.includes('transfer')) return 'send';
  if (t.includes('borrow')) return 'borrow';
  if (t.includes('repay')) return 'repay';
  if (t.includes('swap')) return 'swap';
  if (t.includes('pay') || t.includes('service')) return 'pay';
  if (t.includes('claim')) return 'claim';
  if (t.includes('stake')) return 'stake';
  if (t.includes('follow_up') || t.includes('briefing') || t.includes('goal')) return null;
  return null;
}
