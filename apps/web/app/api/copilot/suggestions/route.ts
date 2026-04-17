import { NextRequest, NextResponse } from "next/server";
import { validateJwt, isValidSuiAddress } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCopilotEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/copilot/suggestions?address=0x…
 * Header: x-zklogin-jwt
 *
 * Returns the unified list of pending Copilot suggestions for the dashboard:
 *
 *   1. ScheduledAction rows where source='behavior_detected' AND
 *      surfaceStatus='pending' (Journey A — DCA recurring patterns)
 *   2. CopilotSuggestion rows where status='pending' (Journeys B/C/D + HF)
 *
 * Both sources are normalised into a single `suggestions[]` shape so the
 * dashboard renderer doesn't care which table they come from. Sorted by
 * surfacedAt DESC (newest first), capped at 20.
 *
 * Returns an empty list (not 404) when COPILOT_ENABLED=false so existing
 * dashboard code can render unconditionally.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get("address");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!isCopilotEnabled()) {
    return NextResponse.json({ suggestions: [] });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ suggestions: [] });
  }

  const nowDate = new Date();

  const [scheduled, oneShots] = await Promise.all([
    prisma.scheduledAction.findMany({
      where: {
        userId: user.id,
        // Default for surfaceStatus is 'pending', so we MUST also require an
        // explicit surfacedAt timestamp to distinguish "actively surfaced"
        // from "row was never surfaced (column default leaked in)".
        // The `<= now` clause hides snoozed cards: snooze advances surfacedAt
        // into the future (now+24h) so the card disappears from the dashboard
        // until the snooze window passes, then auto-reappears.
        // This covers behavior_detected AND migrated user_created actions.
        surfaceStatus: "pending",
        surfacedAt: { not: null, lte: nowDate },
      },
      orderBy: { surfacedAt: "desc" },
      take: 20,
      select: {
        id: true,
        actionType: true,
        amount: true,
        asset: true,
        targetAsset: true,
        cronExpr: true,
        patternType: true,
        confidence: true,
        surfacedAt: true,
        expiresAt: true,
        failedAttempts: true,
      },
    }),
    prisma.copilotSuggestion.findMany({
      // Same `surfacedAt <= now` snooze-hiding semantics as ScheduledAction.
      where: { userId: user.id, status: "pending", surfacedAt: { lte: nowDate } },
      orderBy: { surfacedAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        payload: true,
        surfacedAt: true,
        expiresAt: true,
        failedAttempts: true,
        snoozedCount: true,
      },
    }),
  ]);

  const merged = [
    ...scheduled.map((s) => ({
      kind: "scheduled_action" as const,
      id: s.id,
      patternType: s.patternType,
      actionType: s.actionType,
      amount: s.amount,
      asset: s.asset,
      targetAsset: s.targetAsset,
      cronExpr: s.cronExpr,
      confidence: s.confidence,
      surfacedAt: s.surfacedAt?.toISOString() ?? null,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      failedAttempts: s.failedAttempts,
    })),
    ...oneShots.map((s) => ({
      kind: "copilot_suggestion" as const,
      id: s.id,
      type: s.type,
      payload: s.payload,
      surfacedAt: s.surfacedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      failedAttempts: s.failedAttempts,
      snoozedCount: s.snoozedCount,
    })),
  ].sort((a, b) => {
    const at = a.surfacedAt ? new Date(a.surfacedAt).getTime() : 0;
    const bt = b.surfacedAt ? new Date(b.surfacedAt).getTime() : 0;
    return bt - at;
  });

  return NextResponse.json({ suggestions: merged.slice(0, 20) });
}
