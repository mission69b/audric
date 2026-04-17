import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/lib/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { validateInternalKey } from "@/lib/internal-auth";

export const runtime = "nodejs";

const SENTINEL_ALWAYS_ASK = 999_999;

/**
 * POST /api/internal/copilot/migrate-autonomous
 *
 * One-time migration: convert pre-Copilot autonomous behavior into the new
 * "always ask" Copilot model. See plan §2 / §9.
 *
 * For all ScheduledAction rows where the prior `stage = 3` ("autonomous")
 * marker was set, bump `confirmationsRequired` to a sentinel that means
 * "ask every time" and clear the surfacing fields. Then flag affected users
 * so the dashboard shows a one-time in-app notice on next visit.
 *
 * Idempotent — safe to call repeatedly. Not gated by COPILOT_ENABLED so we
 * can run the migration BEFORE flipping the flag on (the migration stops
 * existing autonomous executions regardless of Copilot's state).
 *
 * Caller: ops, or invoked once by deploy script. Body: empty / ignored.
 *
 * Response: { migratedActions, notifiedUsers }.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) return auth.error;

  const autonomous = await prisma.scheduledAction.findMany({
    where: {
      stage: { gte: 3 },
      enabled: true,
    },
    select: { id: true, userId: true, patternType: true, actionType: true, amount: true, asset: true },
  });

  if (autonomous.length === 0) {
    return NextResponse.json({
      ok: true,
      migratedActions: 0,
      notifiedUsers: 0,
    });
  }

  // Bump migrated actions so they show up in the dashboard immediately.
  // surfacedAt is what the dashboard uses to distinguish "actively asking"
  // from default-pending rows. expiresAt left null intentionally — the cron
  // sweep won't expire migrated rows, the user resolves them at their pace.
  // Once they tap Confirm or Skip, the suggestion lifecycle takes over.
  const now = new Date();
  await prisma.scheduledAction.updateMany({
    where: { id: { in: autonomous.map((a) => a.id) } },
    data: {
      stage: 2,
      confirmationsRequired: SENTINEL_ALWAYS_ASK,
      surfaceStatus: "pending",
      surfacedAt: now,
      failedAttempts: 0,
    },
  });

  const userIds = Array.from(new Set(autonomous.map((a) => a.userId)));

  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { copilotMigrationNoticeShownAt: null },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, suiAddress: true },
  });
  const addressByUserId = new Map(users.map((u) => [u.id, u.suiAddress]));

  await prisma.appEvent.createMany({
    data: autonomous
      .filter((a) => addressByUserId.has(a.userId))
      .map((a) => ({
        address: addressByUserId.get(a.userId)!,
        type: "copilot_autonomous_migrated",
        title: "Autonomous schedule converted to ask-every-time",
        details: {
          scheduledActionId: a.id,
          actionType: a.actionType,
          amount: a.amount,
          asset: a.asset,
          patternType: a.patternType,
        } as InputJsonValue,
      })),
  });

  return NextResponse.json({
    ok: true,
    migratedActions: autonomous.length,
    notifiedUsers: userIds.length,
  });
}
