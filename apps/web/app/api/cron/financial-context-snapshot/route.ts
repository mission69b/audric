/**
 * [v0.7d Phase 6 Block B — 2026-05-21 / S.222] Vercel cron entrypoint
 * for financial context snapshot.
 *
 * Runs daily at 02:30 UTC via `vercel.json` cron (matches the legacy
 * ECS cron's schedule to preserve downstream timing — most readers
 * expect the financial-context snapshot to be fresh by 03:00 UTC).
 *
 * Calls into the shared `runFinancialContextSnapshotJob()` helper.
 * Authenticated with the standard `CRON_SECRET` bearer header so
 * only Vercel's cron infrastructure can invoke it.
 *
 * **Scale note (single-shard for now).** The legacy ECS cron fanned
 * out to 8 parallel shards via `T2000_FIN_CTX_SHARD_COUNT`. The
 * current active-user count comfortably fits a single-shard run
 * within Vercel's 300s `maxDuration` cap. If active users grow past
 * ~200 (where 200 × 1.5s = 300s starts to bite), switch this route
 * to fan out via internal `fetch()` to itself with shard params (the
 * job helper already supports `{ shard, total }`). For now, simplicity
 * wins — no fan-out, no recursive HTTP calls.
 *
 * [v0.7d Phase 6 Block C.3 — 2026-05-21 / S.224] The legacy
 * `/api/internal/financial-context-snapshot` companion route was
 * deleted in Block C.3 once the t2000 ECS cron retired. This Vercel
 * route is now the sole entrypoint. Job implementation lives in
 * `lib/jobs/financial-context-snapshot.ts`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runFinancialContextSnapshotJob } from '@/lib/jobs/financial-context-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const result = await runFinancialContextSnapshotJob();
  const duration = Date.now() - start;

  console.log(
    `[cron financial-context-snapshot] ${result.created} created, ${result.skipped} skipped, ${result.degradedSkipped} degraded-skipped, ${result.errors} errors out of ${result.total} active users (${duration}ms)`,
  );

  return NextResponse.json({ ...result, durationMs: duration });
}
