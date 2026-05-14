/**
 * [v1.4 Item 4] TurnMetrics retention — runs daily at 03:00 UTC via
 * `vercel.json` cron. Deletes rows older than 90 days.
 *
 * [SPEC 30 D-12 — 2026-05-14] Now ALSO prunes AdviceLog at the same
 * 90d TTL. Per D-12 lock: "AdviceLog 90d (matches TurnMetrics; one
 * cron handles both)". One handler, two deletes — keeps cron count
 * low (Vercel cron pricing) and the TTLs in lockstep.
 *
 * Authenticated with the standard `CRON_SECRET` bearer header so only
 * Vercel's cron infrastructure can invoke it. Returns a count for log
 * visibility; failures bubble as 500 so cron retries kick in.
 *
 * Operational note: `CRON_SECRET` is provisioned across all three Vercel
 * environments (production / preview / development). Vercel automatically
 * attaches `Authorization: Bearer ${CRON_SECRET}` to scheduled invocations
 * once the env is set, so the same value powers both server-side
 * validation here and the cron caller — no separate wiring required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [turnDeleted, adviceDeleted] = await Promise.all([
    prisma.turnMetrics.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.adviceLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);

  console.log(
    `[RetentionCleanup] Deleted ${turnDeleted.count} TurnMetrics + ${adviceDeleted.count} AdviceLog rows older than ${RETENTION_DAYS}d`,
  );
  return NextResponse.json({
    turnMetricsDeleted: turnDeleted.count,
    adviceLogDeleted: adviceDeleted.count,
  });
}
