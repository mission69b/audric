/**
 * [SPEC 30 D-12 — 2026-05-14] ConversationLog retention.
 *
 * Runs daily at 03:30 UTC via `vercel.json` cron. Deletes
 * `ConversationLog` rows older than the global default (365d).
 *
 * Per the D-12 lock: "ConversationLog: 365d default + per-user 'delete
 * history older than X days' setting (Privacy pillar)." This handler
 * implements the 365d global default. The per-user override toggle is
 * deferred to a follow-up SPEC (D-12.5) — a UserPreferences.limits
 * field can layer in later without changing this handler's shape.
 *
 * Privacy rationale: 365d is short enough to honor privacy
 * minimization, long enough that Audric Intelligence can leverage past
 * conversations for personalisation. Users who want shorter retention
 * will get the toggle; users who never touch it accept the 365d
 * default by behaviour.
 *
 * Authenticated with the standard `CRON_SECRET` bearer header so only
 * Vercel's cron infrastructure can invoke it. Returns count for log
 * visibility; failures bubble as 500 so cron retries kick in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const RETENTION_DAYS = 365;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await prisma.conversationLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  console.log(
    `[ConversationLogRetention] Deleted ${deleted.count} rows older than ${RETENTION_DAYS}d`,
  );
  return NextResponse.json({ deleted: deleted.count });
}
