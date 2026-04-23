/**
 * [v1.4 Item 4] TurnMetrics retention — runs daily at 03:00 UTC via
 * `vercel.json` cron. Deletes rows older than 90 days.
 *
 * Authenticated with the standard `CRON_SECRET` bearer header so only
 * Vercel's cron infrastructure can invoke it. Returns a count for log
 * visibility; failures bubble as 500 so cron retries kick in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await prisma.turnMetrics.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  console.log(
    `[TurnMetricsCleanup] Deleted ${deleted.count} rows older than ${RETENTION_DAYS} days`,
  );
  return NextResponse.json({ deleted: deleted.count });
}
