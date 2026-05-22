/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] Pending-action timeout sweep —
 * web-v2 port. Verbatim of `apps/web/app/api/cron/turn-metrics-pending-sweep/route.ts`
 * (v1.4.2 Day 3, Spec §Item 3 Fix 3b).
 *
 * Runs every 5 minutes. Closes out `TurnMetrics` rows whose
 * `pendingActionOutcome === 'pending'` for longer than 15 minutes by
 * stamping `'timeout'`. Both apps run this cron during the v0.7c soak
 * window — the `updateMany` is idempotent because already-stamped rows
 * no longer match the `pendingActionOutcome: 'pending'` predicate.
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
 * by the test harness or backend prefetch jobs.
 *
 * NOTE (S.253): `runtime` route segment export dropped to satisfy
 * Next.js `nextConfig.cacheComponents` mode (web-v2's default).
 */
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const TIMEOUT_MINUTES = 15;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);
  const timedOut = await prisma.turnMetrics.updateMany({
    where: {
      pendingActionOutcome: "pending",
      createdAt: { lt: cutoff },
      synthetic: false,
    },
    data: { pendingActionOutcome: "timeout" },
  });

  console.log(
    `[TurnMetricsPendingSweep] Stamped ${timedOut.count} rows as 'timeout' (older than ${TIMEOUT_MINUTES}m)`
  );
  return NextResponse.json({ timedOut: timedOut.count });
}
