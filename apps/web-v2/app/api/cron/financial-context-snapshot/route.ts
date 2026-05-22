/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] Vercel cron entrypoint for
 * financial context snapshot — web-v2 port.
 *
 * Mirrors `apps/web/app/api/cron/financial-context-snapshot/route.ts`
 * (v0.7d Phase 6 Block B / S.222) so web-v2 owns this load-bearing
 * cron during the v0.7c chat-flip + DNS-flip window. Both apps run the
 * same cron at the same UTC time (02:30) against the same shared
 * NeonDB; per-user `upsert by userId` is idempotent so the race is
 * harmless. When `apps/web` is archived (v0.7c Phase 6 Session 8) the
 * apps/web cron disappears automatically and this becomes the sole
 * writer with zero scheduling churn.
 *
 * Runs daily at 02:30 UTC via `vercel.json` cron (matches apps/web to
 * preserve downstream timing — most readers expect the financial-context
 * snapshot to be fresh by 03:00 UTC).
 *
 * Calls into the shared `runFinancialContextSnapshotJob()` helper
 * (verbatim copy in `lib/jobs/financial-context-snapshot.ts`).
 * Authenticated with the standard `CRON_SECRET` bearer header so only
 * Vercel's cron infrastructure can invoke it.
 *
 * **Scale note (single-shard for now).** Same as apps/web: active-user
 * count comfortably fits a single-shard run within Vercel's 300s
 * `maxDuration` cap. If active users grow past ~200 (where 200 × 1.5s =
 * 300s starts to bite), switch this route to fan out via internal
 * `fetch()` to itself with shard params (the job helper already
 * supports `{ shard, total }`). For now, simplicity wins — no fan-out,
 * no recursive HTTP calls.
 */
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runFinancialContextSnapshotJob } from "@/lib/jobs/financial-context-snapshot";

// NOTE (S.253): `runtime`/`dynamic` route segment exports were dropped to
// satisfy Next.js `nextConfig.cacheComponents` mode (web-v2's default).
// nodejs is the default runtime for non-edge routes; the bearer-token
// auth check below makes the response inherently dynamic so no
// `force-dynamic` is needed.
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const result = await runFinancialContextSnapshotJob();
  const duration = Date.now() - start;

  console.log(
    `[cron financial-context-snapshot] ${result.created} created, ${result.skipped} skipped, ${result.degradedSkipped} degraded-skipped, ${result.errors} errors out of ${result.total} active users (${duration}ms)`
  );

  return NextResponse.json({ ...result, durationMs: duration });
}
