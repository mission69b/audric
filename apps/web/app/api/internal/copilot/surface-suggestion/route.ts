import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/lib/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { validateInternalKey } from "@/lib/internal-auth";
import { isCopilotEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

const THROTTLE_WINDOW_HOURS = 24;

type SurfacePayload =
  | {
      kind: "scheduled_action";
      scheduledActionId: string;
      expiresAt: string; // ISO 8601, e.g. end-of-day local
    }
  | {
      kind: "copilot_suggestion";
      address: string; // user wallet address — resolved to userId server-side
      type: "compound" | "idle_action" | "income_action" | "hf_topup";
      payload: Record<string, unknown>;
      expiresAt: string;
      patternKey?: string; // optional throttle key (e.g. "compound:NAVI:USDC") — defaults to type
    };

/**
 * POST /api/internal/copilot/surface-suggestion
 * Called by the t2000 cron when it detects a pattern that warrants surfacing.
 *
 * Two write paths, distinguished by `kind`:
 *
 *   1. `scheduled_action` — flips an existing behavior_detected ScheduledAction
 *      from "idle" to "pending suggestion" (Journey A: DCA recurring patterns).
 *      No new row created; just updates surfaceStatus + surfacedAt + expiresAt.
 *
 *   2. `copilot_suggestion` — creates a new CopilotSuggestion row for
 *      threshold-triggered one-shots (Journeys B/C/D + HF top-up).
 *
 * Both paths enforce a 24h throttle per (userId, patternType|type) to prevent
 * nag-loops if a detector fires repeatedly. See plan §10.
 *
 * Returns 404 (not 503) when COPILOT_ENABLED=false so callers can no-op silently.
 */
export async function POST(request: NextRequest) {
  if (!isCopilotEnabled()) {
    return NextResponse.json({ error: "Copilot disabled" }, { status: 404 });
  }

  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) return auth.error;

  let body: SurfacePayload;
  try {
    body = (await request.json()) as SurfacePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("kind" in body)) {
    return NextResponse.json({ error: "Missing kind" }, { status: 400 });
  }

  const throttleSinceMs = Date.now() - THROTTLE_WINDOW_HOURS * 60 * 60 * 1000;
  const throttleSince = new Date(throttleSinceMs);

  if (body.kind === "scheduled_action") {
    const action = await prisma.scheduledAction.findUnique({
      where: { id: body.scheduledActionId },
      select: {
        id: true,
        userId: true,
        patternType: true,
        source: true,
        surfaceStatus: true,
        surfacedAt: true,
      },
    });

    if (!action) {
      return NextResponse.json({ error: "ScheduledAction not found" }, { status: 404 });
    }

    // Both source values are valid surfacing targets in Copilot mode:
    //   - behavior_detected: pattern detector surfaced it
    //   - user_created: formerly-autonomous schedules migrated to always-ask
    // The source-based gate that used to live here has moved to the dashboard
    // GET query (`surfacedAt IS NOT NULL`) so default-pending rows that were
    // never surfaced don't leak into the suggestions list.

    if (action.surfaceStatus === "pending" && action.surfacedAt) {
      return NextResponse.json(
        { ok: true, throttled: true, reason: "already_pending", id: action.id },
        { status: 200 }
      );
    }

    if (action.surfacedAt && action.surfacedAt > throttleSince) {
      return NextResponse.json(
        {
          ok: true,
          throttled: true,
          reason: "throttle_window",
          id: action.id,
        },
        { status: 200 }
      );
    }

    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
    }

    const updated = await prisma.scheduledAction.update({
      where: { id: action.id },
      data: {
        surfaceStatus: "pending",
        surfacedAt: new Date(),
        expiresAt,
        failedAttempts: 0,
      },
      select: { id: true, userId: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: updated.userId },
      select: { suiAddress: true },
    });

    if (user) {
      await prisma.appEvent.create({
        data: {
          address: user.suiAddress,
          type: "copilot_suggestion_created",
          title: "Audric noticed a recurring pattern",
          details: {
            kind: "scheduled_action",
            scheduledActionId: updated.id,
            patternType: action.patternType,
          } as InputJsonValue,
        },
      });
    }

    return NextResponse.json({ ok: true, id: updated.id });
  }

  if (body.kind === "copilot_suggestion") {
    const user = await prisma.user.findUnique({
      where: { suiAddress: body.address },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const recentOfType = await prisma.copilotSuggestion.findFirst({
      where: {
        userId: user.id,
        type: body.type,
        createdAt: { gt: throttleSince },
      },
      select: { id: true, status: true },
    });

    if (recentOfType) {
      return NextResponse.json(
        {
          ok: true,
          throttled: true,
          reason: "throttle_window",
          existingId: recentOfType.id,
          existingStatus: recentOfType.status,
        },
        { status: 200 }
      );
    }

    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
    }

    const created = await prisma.copilotSuggestion.create({
      data: {
        userId: user.id,
        type: body.type,
        status: "pending",
        payload: body.payload as InputJsonValue,
        expiresAt,
      },
      select: { id: true },
    });

    await prisma.appEvent.create({
      data: {
        address: body.address,
        type: "copilot_suggestion_created",
        title:
          body.type === "compound"
            ? "Audric noticed compoundable rewards"
            : body.type === "idle_action"
              ? "Audric noticed an idle balance"
              : body.type === "income_action"
                ? "Audric noticed recurring income"
                : "Audric noticed a health-factor change",
        details: {
          kind: "copilot_suggestion",
          copilotSuggestionId: created.id,
          type: body.type,
        } as InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true, id: created.id });
  }

  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
