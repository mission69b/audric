import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/lib/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { validateInternalKey } from "@/lib/internal-auth";
import { isCopilotEnabled } from "@/lib/feature-flags";
import { CronExpressionParser } from "cron-parser";

export const runtime = "nodejs";

const BATCH_SIZE = 200;

function nextRunFromCron(expr: string): Date | null {
  try {
    return CronExpressionParser.parse(expr, { tz: "UTC" }).next().toDate();
  } catch {
    return null;
  }
}

/**
 * POST /api/internal/copilot/expire-due
 * Sweeps both ScheduledAction (behavior_detected only) and CopilotSuggestion
 * tables for rows past expiresAt with status='pending' and marks them 'expired'.
 *
 * Called hourly by the t2000 copilotExpiry cron. Idempotent.
 *
 * Returns 404 (not 503) when COPILOT_ENABLED=false so the cron can no-op silently.
 */
export async function POST(request: NextRequest) {
  if (!isCopilotEnabled()) {
    return NextResponse.json({ error: "Copilot disabled" }, { status: 404 });
  }

  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) return auth.error;

  const now = new Date();

  // ScheduledAction sweep — both behavior_detected and migrated user_created
  // rows can carry surfaceStatus='pending' + expiresAt. Source filter intentionally
  // omitted (matches the dashboard GET semantics: surfacedAt-driven, not source-driven).
  const dueActions = await prisma.scheduledAction.findMany({
    where: {
      surfaceStatus: "pending",
      surfacedAt: { not: null },
      expiresAt: { lt: now, not: null },
    },
    select: { id: true, userId: true, patternType: true, cronExpr: true },
    take: BATCH_SIZE,
  });

  if (dueActions.length > 0) {
    // Per-row update so we can advance nextRunAt to the next cadence — if we
    // left nextRunAt in the past, the t2000 cron would re-poll every hour
    // and burn API calls just to be throttled by surface-suggestion.
    await Promise.all(
      dueActions.map((a) => {
        const nextRun = nextRunFromCron(a.cronExpr);
        return prisma.scheduledAction.update({
          where: { id: a.id },
          data: {
            surfaceStatus: "expired",
            ...(nextRun ? { nextRunAt: nextRun } : {}),
          },
        });
      })
    );

    const userIds = Array.from(new Set(dueActions.map((a) => a.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, suiAddress: true },
    });
    const addressByUserId = new Map(users.map((u) => [u.id, u.suiAddress]));

    await prisma.appEvent.createMany({
      data: dueActions
        .filter((a) => addressByUserId.has(a.userId))
        .map((a) => ({
          address: addressByUserId.get(a.userId)!,
          type: "copilot_suggestion_expired",
          title: "Suggestion expired",
          details: {
            kind: "scheduled_action",
            scheduledActionId: a.id,
            patternType: a.patternType,
          } as InputJsonValue,
        })),
    });
  }

  // CopilotSuggestion sweep
  const dueSuggestions = await prisma.copilotSuggestion.findMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
    },
    select: { id: true, userId: true, type: true },
    take: BATCH_SIZE,
  });

  if (dueSuggestions.length > 0) {
    await prisma.copilotSuggestion.updateMany({
      where: { id: { in: dueSuggestions.map((s) => s.id) } },
      data: { status: "expired" },
    });

    const userIds = Array.from(new Set(dueSuggestions.map((s) => s.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, suiAddress: true },
    });
    const addressByUserId = new Map(users.map((u) => [u.id, u.suiAddress]));

    await prisma.appEvent.createMany({
      data: dueSuggestions
        .filter((s) => addressByUserId.has(s.userId))
        .map((s) => ({
          address: addressByUserId.get(s.userId)!,
          type: "copilot_suggestion_expired",
          title: "Suggestion expired",
          details: {
            kind: "copilot_suggestion",
            copilotSuggestionId: s.id,
            type: s.type,
          } as InputJsonValue,
        })),
    });
  }

  return NextResponse.json({
    ok: true,
    expired: {
      scheduledActions: dueActions.length,
      copilotSuggestions: dueSuggestions.length,
    },
  });
}
