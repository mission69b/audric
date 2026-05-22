/**
 * [v0.7c Phase 6.5 / S.253 — 2026-05-22] ConversationLog 365d retention
 * — web-v2 port. Verbatim of
 * `apps/web/app/api/cron/conversation-log-retention/route.ts` (SPEC 30
 * D-12 — 2026-05-14).
 *
 * Runs daily at 03:30 UTC. Deletes `ConversationLog` rows older than the
 * global default (365d). Both apps run this cron during the v0.7c soak
 * window — `deleteMany` is idempotent.
 *
 * Per the D-12 lock: "ConversationLog: 365d default + per-user 'delete
 * history older than X days' setting (Privacy pillar)." This handler
 * implements the 365d global default. The per-user override toggle is
 * deferred to a follow-up SPEC (D-12.5).
 *
 * Privacy rationale: 365d is short enough to honor privacy
 * minimization, long enough that Audric Intelligence can leverage past
 * conversations for personalisation.
 *
 * NOTE (S.253): `runtime` route segment export dropped to satisfy
 * Next.js `nextConfig.cacheComponents` mode (web-v2's default).
 */
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const RETENTION_DAYS = 365;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await prisma.conversationLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  console.log(
    `[ConversationLogRetention] Deleted ${deleted.count} rows older than ${RETENTION_DAYS}d`
  );
  return NextResponse.json({ deleted: deleted.count });
}
