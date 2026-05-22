/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] Vercel cron entrypoint for
 * portfolio snapshot — web-v2 port.
 *
 * Mirrors `apps/web/app/api/cron/portfolio-snapshot/route.ts` (v0.7d
 * Phase 6 Block B / S.222) so web-v2 owns the cron during the v0.7c
 * chat-flip + DNS-flip window. Both apps register this cron at the same
 * UTC time (07:00); per-user `findUnique + create` is idempotent so the
 * race is harmless. When apps/web is archived the apps/web cron
 * disappears automatically.
 *
 * Runs daily at 07:00 UTC. Authenticated with the standard `CRON_SECRET`
 * bearer header. Job implementation lives in `lib/jobs/portfolio-snapshot.ts`.
 *
 * NOTE (S.253): `runtime`/`dynamic` route segment exports were dropped to
 * satisfy Next.js `nextConfig.cacheComponents` mode (web-v2's default).
 */
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runPortfolioSnapshotJob } from "@/lib/jobs/portfolio-snapshot";

export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const result = await runPortfolioSnapshotJob();
  const duration = Date.now() - start;

  console.log(
    `[cron portfolio-snapshot] ${result.created} created, ${result.skipped} skipped, ${result.errors} errors out of ${result.total} users (${duration}ms)`
  );

  return NextResponse.json({ ...result, durationMs: duration });
}
