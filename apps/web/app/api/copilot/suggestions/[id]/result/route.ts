import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/lib/generated/prisma/internal/prismaNamespace";
import { validateJwt, isValidSuiAddress } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCopilotEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

const MAX_FAIL_STRIKES = 3;

interface ResultBody {
  address: string;
  kind: "scheduled_action" | "copilot_suggestion";
  outcome: "confirmed" | "failed";
  digest?: string;
  errorReason?: string;
}

/**
 * POST /api/copilot/suggestions/[id]/result
 * Header: x-zklogin-jwt
 *
 * Called by the confirm screen after a tx completes (success) or fails. Plan §6:
 *
 *   - confirmed: marks 'confirmed', stamps confirmedAt + lastExecutedAt, bumps
 *     User.copilotConfirmedCount, logs AppEvent with digest.
 *   - failed: increments failedAttempts; suggestion stays 'pending' so the user
 *     can retry. Auto-rolls to 'failed' after MAX_FAIL_STRIKES (3) strikes.
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
  let body: ResultBody;
  try {
    body = (await request.json()) as ResultBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.address || !isValidSuiAddress(body.address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (body.kind !== "scheduled_action" && body.kind !== "copilot_suggestion") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (body.outcome !== "confirmed" && body.outcome !== "failed") {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: body.address },
    select: { id: true, suiAddress: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const now = new Date();

  if (body.kind === "scheduled_action") {
    const action = await prisma.scheduledAction.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        surfaceStatus: true,
        failedAttempts: true,
        amount: true,
        totalExecutions: true,
        totalAmountUsdc: true,
        patternType: true,
      },
    });
    if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.outcome === "confirmed") {
      await prisma.$transaction([
        prisma.scheduledAction.update({
          where: { id: action.id },
          data: {
            surfaceStatus: "confirmed",
            lastExecutedAt: now,
            totalExecutions: action.totalExecutions + 1,
            totalAmountUsdc: action.totalAmountUsdc + Number(action.amount),
            failedAttempts: 0,
          },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { copilotConfirmedCount: { increment: 1 } },
        }),
        prisma.appEvent.create({
          data: {
            address: user.suiAddress,
            type: "copilot_suggestion_confirmed",
            title: "Suggestion confirmed",
            details: {
              kind: "scheduled_action",
              scheduledActionId: action.id,
              patternType: action.patternType,
              digest: body.digest ?? null,
            } as InputJsonValue,
            digest: body.digest ?? undefined,
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    const nextStrikes = action.failedAttempts + 1;
    const shouldAutoFail = nextStrikes >= MAX_FAIL_STRIKES;
    await prisma.$transaction([
      prisma.scheduledAction.update({
        where: { id: action.id },
        data: {
          failedAttempts: nextStrikes,
          surfaceStatus: shouldAutoFail ? "failed" : action.surfaceStatus,
        },
      }),
      prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_suggestion_failed",
          title: shouldAutoFail
            ? "Suggestion auto-failed after 3 attempts"
            : "Suggestion attempt failed",
          details: {
            kind: "scheduled_action",
            scheduledActionId: action.id,
            attempt: nextStrikes,
            errorReason: body.errorReason ?? null,
          } as InputJsonValue,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, attempt: nextStrikes, autoFailed: shouldAutoFail });
  }

  const suggestion = await prisma.copilotSuggestion.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, failedAttempts: true, type: true },
  });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.outcome === "confirmed") {
    await prisma.$transaction([
      prisma.copilotSuggestion.update({
        where: { id: suggestion.id },
        data: { status: "confirmed", confirmedAt: now, failedAttempts: 0 },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { copilotConfirmedCount: { increment: 1 } },
      }),
      prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_suggestion_confirmed",
          title: "Suggestion confirmed",
          details: {
            kind: "copilot_suggestion",
            copilotSuggestionId: suggestion.id,
            type: suggestion.type,
            digest: body.digest ?? null,
          } as InputJsonValue,
          digest: body.digest ?? undefined,
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  const nextStrikes = suggestion.failedAttempts + 1;
  const shouldAutoFail = nextStrikes >= MAX_FAIL_STRIKES;
  await prisma.$transaction([
    prisma.copilotSuggestion.update({
      where: { id: suggestion.id },
      data: {
        failedAttempts: nextStrikes,
        status: shouldAutoFail ? "failed" : suggestion.status,
        failedAt: shouldAutoFail ? now : undefined,
      },
    }),
    prisma.appEvent.create({
      data: {
        address: user.suiAddress,
        type: "copilot_suggestion_failed",
        title: shouldAutoFail
          ? "Suggestion auto-failed after 3 attempts"
          : "Suggestion attempt failed",
        details: {
          kind: "copilot_suggestion",
          copilotSuggestionId: suggestion.id,
          attempt: nextStrikes,
          errorReason: body.errorReason ?? null,
        } as InputJsonValue,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, attempt: nextStrikes, autoFailed: shouldAutoFail });
}
