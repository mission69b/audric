/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] TurnMetrics + AdviceLog 90d
 * retention — web-v2 port. Verbatim of
 * `apps/web/app/api/cron/turn-metrics-cleanup/route.ts` (v1.4 Item 4 +
 * SPEC 30 D-12 — 2026-05-14).
 *
 * Runs daily at 03:00 UTC. Deletes `TurnMetrics` AND `AdviceLog` rows
 * older than 90 days. Both apps run this cron during the v0.7c soak
 * window — `deleteMany` with the same cutoff is idempotent (whichever
 * runs second finds nothing to delete).
 *
 * Per the D-12 lock: "AdviceLog 90d (matches TurnMetrics; one cron
 * handles both)". One handler, two deletes — keeps cron count low
 * (Vercel cron pricing) and the TTLs in lockstep.
 *
 * NOTE (S.253): `runtime` route segment export dropped to satisfy
 * Next.js `nextConfig.cacheComponents` mode (web-v2's default).
 */
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [turnDeleted, adviceDeleted] = await Promise.all([
    prisma.turnMetrics.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.adviceLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);

  console.log(
    `[RetentionCleanup] Deleted ${turnDeleted.count} TurnMetrics + ${adviceDeleted.count} AdviceLog rows older than ${RETENTION_DAYS}d`
  );
  return NextResponse.json({
    turnMetricsDeleted: turnDeleted.count,
    adviceLogDeleted: adviceDeleted.count,
  });
}
