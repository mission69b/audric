/**
 * [v1.4.2 — Day 3 / Spec §Item 3 / Fix 3b] Pending-action timeout sweep —
 * runs every 5 minutes via `vercel.json` cron. Closes out
 * `TurnMetrics` rows whose `pendingActionOutcome === 'pending'` for
 * longer than the timeout window by stamping `'timeout'`.
 *
 * Why: the chat route writes a `TurnMetrics` row at turn close with
 * `pendingActionOutcome: 'pending'` whenever the engine yielded a write.
 * The resume route is supposed to overwrite that to
 * `approved` / `declined` / `modified` once the user resolves it. Some
 * pending actions are never resolved — the user closes the tab, the
 * session expires, the engine drops the session for any of a dozen
 * reasons. Without this sweep those rows live forever as `'pending'`
 * and skew the resolution-rate dashboards.
 *
 * Cutoff: 15 minutes. Pending actions in production resolve in seconds
 * (UI keeps the tab focused while the user signs); a 15-minute window
 * is generous enough that real human latency never gets stamped
 * `timeout`, while still surfacing genuinely abandoned pending
 * actions within one cron tick of expiry.
 *
 * Synthetic exclusion: `synthetic: false` filter skips rows generated
 * by the test harness or backend prefetch jobs — those don't have a
 * UI loop and would otherwise be timed out unfairly. The `synthetic`
 * column is additive in the v1.4.2 migration so all real pre-migration
 * rows already evaluate to `synthetic = false` (the column default),
 * which is the conservative behaviour we want here.
 *
 * Auth: same `CRON_SECRET` Bearer pattern as
 * `app/api/cron/turn-metrics-cleanup/route.ts`. Vercel injects the
 * header automatically when the env var is set. Returns the count
 * of timed-out rows for log visibility.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const TIMEOUT_MINUTES = 15;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);
  const timedOut = await prisma.turnMetrics.updateMany({
    where: {
      pendingActionOutcome: 'pending',
      createdAt: { lt: cutoff },
      synthetic: false,
    },
    data: { pendingActionOutcome: 'timeout' },
  });

  console.log(
    `[TurnMetricsPendingSweep] Stamped ${timedOut.count} rows as 'timeout' (older than ${TIMEOUT_MINUTES}m)`,
  );
  return NextResponse.json({ timedOut: timedOut.count });
}
