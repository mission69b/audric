import { NextRequest, NextResponse } from "next/server";
import { validateJwt, isValidSuiAddress } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCopilotEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/copilot/in-chat-surface?address=0x…
 * Header: x-zklogin-jwt
 *
 * Wave C.6 — returns at most one Copilot suggestion to surface as a card
 * inside the chat timeline at session open. Implements cross-surface
 * suppression so we don't double-nag a user who just saw the same
 * suggestion on the dashboard row:
 *
 *   - If `lastDashboardVisitAt` is within DASHBOARD_SUPPRESS_WINDOW_MS
 *     (default 6h), return `{ suggestion: null, suppressed: 'recent_dashboard' }`.
 *
 * When not suppressed, picks the highest-priority pending suggestion using
 * the same `surfacedAt <= now AND status='pending'` semantics as
 * `/api/copilot/suggestions`. Priority order (most → least urgent):
 *
 *   1. hf_topup        — protect liquidation
 *   2. compound        — claimable rewards burning APY
 *   3. idle_action     — idle balance not earning
 *   4. income_action   — recurring income detector (deferred — Wave C.2 note)
 *   5. scheduled_action (DCA / behavior-detected) — least time-sensitive
 *
 * Returns `{ suggestion: null }` on any of:
 *   - COPILOT_ENABLED=false
 *   - user not found
 *   - no pending suggestions
 *
 * Response shape mirrors a single entry from `/api/copilot/suggestions`
 * so the same renderer (CopilotSuggestionCard) works without translation.
 */
const DASHBOARD_SUPPRESS_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h

const ONE_SHOT_PRIORITY: Record<string, number> = {
  hf_topup: 1,
  compound: 2,
  idle_action: 3,
  income_action: 4,
};

export async function GET(request: NextRequest) {
  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get("address");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!isCopilotEnabled()) {
    return NextResponse.json({ suggestion: null });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true, lastDashboardVisitAt: true },
  });

  if (!user) {
    return NextResponse.json({ suggestion: null });
  }

  // Cross-surface suppression — if the dashboard row was visible recently,
  // skip the in-chat surface entirely so the user only sees one copy.
  const now = Date.now();
  if (
    user.lastDashboardVisitAt &&
    now - user.lastDashboardVisitAt.getTime() < DASHBOARD_SUPPRESS_WINDOW_MS
  ) {
    return NextResponse.json({
      suggestion: null,
      suppressed: "recent_dashboard",
    });
  }

  const nowDate = new Date();

  const [oneShots, scheduled] = await Promise.all([
    prisma.copilotSuggestion.findMany({
      where: {
        userId: user.id,
        status: "pending",
        surfacedAt: { lte: nowDate },
      },
      orderBy: { surfacedAt: "desc" },
      take: 10,
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
    prisma.scheduledAction.findMany({
      where: {
        userId: user.id,
        surfaceStatus: "pending",
        surfacedAt: { not: null, lte: nowDate },
      },
      orderBy: { surfacedAt: "desc" },
      take: 10,
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
  ]);

  // Pick highest-priority one-shot first; fall back to oldest scheduled
  // action only if no one-shots exist (scheduled DCA suggestions are the
  // least time-sensitive, so they shouldn't pre-empt urgent prompts).
  const topOneShot = [...oneShots].sort(
    (a, b) =>
      (ONE_SHOT_PRIORITY[a.type] ?? 99) - (ONE_SHOT_PRIORITY[b.type] ?? 99),
  )[0];

  if (topOneShot) {
    return NextResponse.json({
      suggestion: {
        kind: "copilot_suggestion" as const,
        id: topOneShot.id,
        type: topOneShot.type,
        payload: topOneShot.payload,
        surfacedAt: topOneShot.surfacedAt.toISOString(),
        expiresAt: topOneShot.expiresAt.toISOString(),
        failedAttempts: topOneShot.failedAttempts,
        snoozedCount: topOneShot.snoozedCount,
      },
    });
  }

  const topScheduled = scheduled[0];
  if (topScheduled) {
    return NextResponse.json({
      suggestion: {
        kind: "scheduled_action" as const,
        id: topScheduled.id,
        patternType: topScheduled.patternType,
        actionType: topScheduled.actionType,
        amount: topScheduled.amount,
        asset: topScheduled.asset,
        targetAsset: topScheduled.targetAsset,
        cronExpr: topScheduled.cronExpr,
        confidence: topScheduled.confidence,
        surfacedAt: topScheduled.surfacedAt?.toISOString() ?? null,
        expiresAt: topScheduled.expiresAt?.toISOString() ?? null,
        failedAttempts: topScheduled.failedAttempts,
      },
    });
  }

  return NextResponse.json({ suggestion: null });
}
