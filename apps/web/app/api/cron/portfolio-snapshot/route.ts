/**
 * [v0.7d Phase 6 Block B — 2026-05-21 / S.222] Vercel cron entrypoint
 * for portfolio snapshot.
 *
 * Runs daily at 07:00 UTC via `vercel.json` cron. Calls into the
 * shared `runPortfolioSnapshotJob()` helper. Authenticated with the
 * standard `CRON_SECRET` bearer header so only Vercel's cron
 * infrastructure can invoke it.
 *
 * [v0.7d Phase 6 Block C.3 — 2026-05-21 / S.224] The legacy
 * `/api/internal/portfolio-snapshot` companion route was deleted in
 * Block C.3 once the t2000 ECS cron retired. This Vercel route is
 * now the sole entrypoint. Job implementation lives in
 * `lib/jobs/portfolio-snapshot.ts`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runPortfolioSnapshotJob } from '@/lib/jobs/portfolio-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const result = await runPortfolioSnapshotJob();
  const duration = Date.now() - start;

  console.log(
    `[cron portfolio-snapshot] ${result.created} created, ${result.skipped} skipped, ${result.errors} errors out of ${result.total} users (${duration}ms)`,
  );

  return NextResponse.json({ ...result, durationMs: duration });
}
