import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { runAllDetectors } from '@/lib/chain-memory';
import type { AppEventRecord, SnapshotRecord } from '@/lib/chain-memory';
import { CronExpressionParser } from 'cron-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const LOOKBACK_DAYS = 90;

/**
 * POST /api/internal/pattern-detection
 * Called by t2000 cron to detect behavioral patterns for a user.
 * Creates Stage 0 ScheduledActions for new patterns.
 * Body: { userId: string }
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body?.userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { userId } = body as { userId: string };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { suiAddress: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  const [rawEvents, rawSnapshots] = await Promise.all([
    prisma.appEvent.findMany({
      where: { address: user.suiAddress, createdAt: { gte: since } },
      select: { type: true, title: true, details: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.portfolioSnapshot.findMany({
      where: { userId, date: { gte: since } },
      select: {
        date: true,
        walletValueUsd: true,
        savingsValueUsd: true,
        debtValueUsd: true,
        netWorthUsd: true,
        yieldEarnedUsd: true,
        healthFactor: true,
      },
      orderBy: { date: 'asc' },
    }),
  ]);

  if (rawEvents.length === 0 && rawSnapshots.length === 0) {
    return NextResponse.json({ detected: 0, reason: 'no_data' });
  }

  const events: AppEventRecord[] = rawEvents.map((e) => ({
    type: e.type,
    title: e.title,
    details: (e.details as Record<string, unknown>) ?? null,
    createdAt: e.createdAt,
  }));

  const snapshots: SnapshotRecord[] = rawSnapshots.map((s) => ({
    date: s.date,
    walletValueUsd: s.walletValueUsd,
    savingsValueUsd: s.savingsValueUsd,
    debtValueUsd: s.debtValueUsd,
    netWorthUsd: s.netWorthUsd,
    yieldEarnedUsd: s.yieldEarnedUsd,
    healthFactor: s.healthFactor,
  }));

  const patterns = runAllDetectors(events, snapshots);

  if (patterns.length === 0) {
    return NextResponse.json({ detected: 0, reason: 'no_patterns' });
  }

  // Deduplicate: skip if a ScheduledAction with same patternType already exists
  // for this user in any stage (except declined > 30 days ago which can be re-detected)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const existing = await prisma.scheduledAction.findMany({
    where: {
      userId,
      source: 'behavior_detected',
      patternType: { not: null },
      OR: [
        { declinedAt: null },
        { declinedAt: { gte: thirtyDaysAgo } },
      ],
    },
    select: { patternType: true },
  });

  const existingTypes = new Set(existing.map((a) => a.patternType));
  const newPatterns = patterns.filter((p) => !existingTypes.has(p.type));

  if (newPatterns.length === 0) {
    return NextResponse.json({ detected: 0, reason: 'all_duplicates' });
  }

  let created = 0;
  for (const p of newPatterns) {
    const schedule = p.proposedAction.schedule;
    let nextRunAt = new Date(Date.now() + 7 * 86_400_000);
    if (schedule) {
      try {
        const interval = CronExpressionParser.parse(schedule, { tz: 'UTC' });
        nextRunAt = interval.next().toDate();
      } catch { /* use default */ }
    }

    await prisma.scheduledAction.create({
      data: {
        userId,
        actionType: p.proposedAction.toolName === 'swap_execute' ? 'swap'
          : p.proposedAction.toolName === 'repay_debt' ? 'repay'
          : 'save',
        amount: (p.proposedAction.params.amount as number)
          ?? (p.proposedAction.trigger?.threshold as number | undefined)
          ?? 50,
        asset: (p.proposedAction.params.asset as string)
          ?? (p.proposedAction.params.fromAsset as string)
          ?? 'USDC',
        targetAsset: (p.proposedAction.params.toAsset as string) ?? null,
        cronExpr: schedule ?? '0 9 * * 5',
        nextRunAt,
        enabled: false,
        source: 'behavior_detected',
        patternType: p.type,
        detectedAt: new Date(),
        confidence: p.confidence,
        stage: 0,
        confirmationsRequired: 3,
        confirmationsCompleted: 0,
      },
    });
    created++;
  }

  return NextResponse.json({ detected: created, total_patterns: patterns.length });
}
