import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { runAllClassifiers } from '@/lib/chain-memory';
import type { AppEventRecord, SnapshotRecord } from '@/lib/chain-memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_MEMORIES = 50;
const JACCARD_THRESHOLD = 0.7;
const LOOKBACK_DAYS = 90;

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * POST /api/internal/chain-memory
 * Called by t2000 cron to extract chain-derived financial facts for a user.
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
    return NextResponse.json({ skipped: true, reason: 'no_data' });
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

  const facts = runAllClassifiers(events, snapshots);

  if (facts.length === 0) {
    return NextResponse.json({ extracted: 0, reason: 'no_patterns' });
  }

  const existingMemories = await prisma.userMemory.findMany({
    where: { userId, active: true },
    select: { content: true, memoryType: true },
    orderBy: { extractedAt: 'desc' },
  });

  const deduped = facts.filter((f) =>
    !existingMemories.some((em) => jaccardSimilarity(f.fact, em.content) > JACCARD_THRESHOLD),
  );

  if (deduped.length === 0) {
    return NextResponse.json({ extracted: 0, reason: 'all_duplicates' });
  }

  // Soft-expire stale memories
  await prisma.userMemory.updateMany({
    where: {
      userId,
      active: true,
      expiresAt: { lte: new Date() },
    },
    data: { active: false },
  });

  const activeCount = await prisma.userMemory.count({
    where: { userId, active: true },
  });

  const slotsAvailable = Math.max(0, MAX_MEMORIES - activeCount);
  const toInsert = deduped.slice(0, slotsAvailable);

  if (toInsert.length > 0) {
    await prisma.userMemory.createMany({
      data: toInsert.map((f) => ({
        userId,
        memoryType: f.type === 'deposit_pattern' || f.type === 'borrow_behavior' ? 'pattern' : 'fact',
        content: f.fact,
        confidence: f.confidence,
        active: true,
        source: 'chain',
      })),
    });
  }

  return NextResponse.json({ extracted: toInsert.length, total_facts: facts.length });
}
