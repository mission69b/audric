import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/lib/generated/prisma/internal/prismaNamespace";
import { validateJwt, isValidSuiAddress } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCopilotEnabled } from "@/lib/feature-flags";
import { CronExpressionParser } from "cron-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNOOZE_HOURS = 24; // Plan §4: snooze duration is fixed at 24h

function nextRunFromCron(expr: string): Date | null {
  try {
    return CronExpressionParser.parse(expr, { tz: "UTC" }).next().toDate();
  } catch {
    return null;
  }
}

/**
 * GET /api/copilot/suggestions/[id]?address=…&kind=scheduled_action|copilot_suggestion
 * Header: x-zklogin-jwt
 *
 * Single-suggestion lookup used by the /copilot/confirm/[kind]/[id] route.
 * Includes status so the confirm screen can render the soft "expired" state
 * without going through 404 (plan §6).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCopilotEnabled()) {
    return NextResponse.json({ error: "Copilot disabled" }, { status: 404 });
  }

  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  const { id } = await params;
  const address = request.nextUrl.searchParams.get("address");
  const kind = request.nextUrl.searchParams.get("kind");

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (kind !== "scheduled_action" && kind !== "copilot_suggestion") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (kind === "scheduled_action") {
    const action = await prisma.scheduledAction.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        actionType: true,
        amount: true,
        asset: true,
        targetAsset: true,
        cronExpr: true,
        patternType: true,
        confidence: true,
        surfaceStatus: true,
        surfacedAt: true,
        expiresAt: true,
        failedAttempts: true,
      },
    });
    if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      kind: "scheduled_action" as const,
      ...action,
      surfacedAt: action.surfacedAt?.toISOString() ?? null,
      expiresAt: action.expiresAt?.toISOString() ?? null,
    });
  }

  const suggestion = await prisma.copilotSuggestion.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      type: true,
      payload: true,
      status: true,
      surfacedAt: true,
      expiresAt: true,
      failedAttempts: true,
      snoozedCount: true,
    },
  });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    kind: "copilot_suggestion" as const,
    ...suggestion,
    surfacedAt: suggestion.surfacedAt.toISOString(),
    expiresAt: suggestion.expiresAt.toISOString(),
  });
}

interface ActionBody {
  address: string;
  kind: "scheduled_action" | "copilot_suggestion";
  action: "snooze" | "skip" | "pause_pattern" | "never_again";
}

/**
 * POST /api/copilot/suggestions/[id]
 * Header: x-zklogin-jwt
 * Body: { address, kind, action }
 *
 * Mutates the suggestion in-place. Confirm/execute lives on the dedicated
 * confirm route — this endpoint covers the dismissal/postpone paths only.
 *
 * Actions:
 *   - snooze: surfaceStatus stays 'pending', expiresAt += 24h
 *     ('Not today' from in-chat also maps here, per plan §7)
 *   - skip: marks 'skipped' (one-off dismissal, pattern remains active)
 *   - pause_pattern: marks 'skipped' AND disables the underlying recurring
 *     ScheduledAction (only valid for kind=scheduled_action)
 *   - never_again: marks 'skipped' AND deletes the ScheduledAction or marks
 *     the CopilotSuggestion type as opted-out for the user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCopilotEnabled()) {
    return NextResponse.json({ error: "Copilot disabled" }, { status: 404 });
  }

  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  const { id } = await params;

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.address || !isValidSuiAddress(body.address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!["snooze", "skip", "pause_pattern", "never_again"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: body.address },
    select: { id: true, suiAddress: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = new Date();

  if (body.kind === "scheduled_action") {
    const action = await prisma.scheduledAction.findFirst({
      where: { id, userId: user.id },
      select: { id: true, surfaceStatus: true, patternType: true, expiresAt: true, cronExpr: true },
    });

    if (!action) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    if (action.surfaceStatus !== "pending") {
      return NextResponse.json(
        { error: `Suggestion is already ${action.surfaceStatus}` },
        { status: 409 }
      );
    }

    if (body.action === "snooze") {
      const snoozeUntil = new Date(now.getTime() + SNOOZE_HOURS * 60 * 60 * 1000);
      await prisma.scheduledAction.update({
        where: { id: action.id },
        data: { expiresAt: snoozeUntil },
      });
      await prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_suggestion_snoozed",
          title: "Suggestion snoozed 24h",
          details: { kind: "scheduled_action", scheduledActionId: action.id } as InputJsonValue,
        },
      });
      return NextResponse.json({ ok: true, snoozedUntil: snoozeUntil.toISOString() });
    }

    if (body.action === "skip") {
      // Skip = "not this time" — advance nextRunAt to the next cadence so the
      // pattern remains active (only pause_pattern / never_again disable it).
      const nextRun = nextRunFromCron(action.cronExpr);
      await prisma.scheduledAction.update({
        where: { id: action.id },
        data: {
          surfaceStatus: "skipped",
          lastSkippedAt: now,
          ...(nextRun ? { nextRunAt: nextRun } : {}),
        },
      });
      await prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_suggestion_skipped",
          title: "Suggestion skipped",
          details: { kind: "scheduled_action", scheduledActionId: action.id } as InputJsonValue,
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "pause_pattern") {
      await prisma.scheduledAction.update({
        where: { id: action.id },
        data: {
          surfaceStatus: "skipped",
          enabled: false,
          pausedAt: now,
          lastSkippedAt: now,
        },
      });
      await prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_pattern_paused",
          title: "Pattern paused",
          details: { scheduledActionId: action.id, patternType: action.patternType } as InputJsonValue,
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "never_again") {
      await prisma.scheduledAction.delete({ where: { id: action.id } });
      await prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_pattern_deleted",
          title: "Pattern removed",
          details: { scheduledActionId: action.id, patternType: action.patternType } as InputJsonValue,
        },
      });
      return NextResponse.json({ ok: true });
    }
  }

  if (body.kind === "copilot_suggestion") {
    const suggestion = await prisma.copilotSuggestion.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true, type: true, expiresAt: true, snoozedCount: true },
    });

    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    if (suggestion.status !== "pending") {
      return NextResponse.json(
        { error: `Suggestion is already ${suggestion.status}` },
        { status: 409 }
      );
    }

    if (body.action === "snooze") {
      const snoozeUntil = new Date(now.getTime() + SNOOZE_HOURS * 60 * 60 * 1000);
      await prisma.copilotSuggestion.update({
        where: { id: suggestion.id },
        data: {
          expiresAt: snoozeUntil,
          snoozedCount: suggestion.snoozedCount + 1,
        },
      });
      await prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_suggestion_snoozed",
          title: "Suggestion snoozed 24h",
          details: { kind: "copilot_suggestion", copilotSuggestionId: suggestion.id } as InputJsonValue,
        },
      });
      return NextResponse.json({ ok: true, snoozedUntil: snoozeUntil.toISOString() });
    }

    // skip / pause_pattern / never_again all collapse to "skipped" for one-shots
    // (there is no underlying recurring schedule to disable). never_again is
    // treated as a soft signal logged via AppEvent so a future detector pass
    // can suppress the same type for this user.
    await prisma.copilotSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "skipped", skippedAt: now },
    });

    await prisma.appEvent.create({
      data: {
        address: user.suiAddress,
        type:
          body.action === "never_again"
            ? "copilot_suggestion_dismissed_forever"
            : "copilot_suggestion_skipped",
        title: body.action === "never_again" ? "Suggestion type dismissed" : "Suggestion skipped",
        details: {
          kind: "copilot_suggestion",
          copilotSuggestionId: suggestion.id,
          type: suggestion.type,
        } as InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
