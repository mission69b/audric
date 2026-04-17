import { NextRequest, NextResponse } from "next/server";
import { validateJwt, isValidSuiAddress } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCopilotEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_NUDGE_THRESHOLD = 10;
const SENTINEL_ALWAYS_ASK = 999_999;

interface OnboardingResponse {
  showOnboarding: boolean;
  showEmailNudge: boolean;
  hasMigratedActions: boolean;
  confirmedCount: number;
  threshold: number;
}

/**
 * GET /api/user/copilot-onboarding?address=0x…
 * Header: x-zklogin-jwt
 *
 * Wave C.7 — drives two one-time UX nudges:
 *
 *   1. CopilotOnboardingModal — first-time intro to Smart Confirmations.
 *      Shown when `copilotMigrationNoticeShownAt` is null. Migrated users
 *      (who had `isAutonomous=true` schedules converted to ask-every-time)
 *      get a different copy variant — flagged via `hasMigratedActions`.
 *
 *   2. EmailAddNudge — banner asking the user to add an email so we can
 *      send the daily digest. Shown when:
 *        - copilotConfirmedCount >= 10 (proven engagement)
 *        - email is missing OR not verified
 *        - copilotEmailNudgeShownAt is null (never dismissed)
 *
 * Returns safe defaults when COPILOT_ENABLED=false or the user doesn't
 * exist yet — the modal/nudge components hide themselves.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get("address");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const empty: OnboardingResponse = {
    showOnboarding: false,
    showEmailNudge: false,
    hasMigratedActions: false,
    confirmedCount: 0,
    threshold: EMAIL_NUDGE_THRESHOLD,
  };

  if (!isCopilotEnabled()) {
    return NextResponse.json(empty);
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      copilotConfirmedCount: true,
      copilotMigrationNoticeShownAt: true,
      copilotEmailNudgeShownAt: true,
    },
  });

  if (!user) {
    return NextResponse.json(empty);
  }

  // Detect migrated users by the SENTINEL_ALWAYS_ASK marker the migration
  // route stamped onto their pre-Copilot autonomous schedules. Any matching
  // row means we should show the migration variant of the modal.
  const migratedCount = await prisma.scheduledAction.count({
    where: { userId: user.id, confirmationsRequired: SENTINEL_ALWAYS_ASK },
  });

  const showOnboarding = user.copilotMigrationNoticeShownAt === null;
  const hasVerifiedEmail = Boolean(user.email && user.emailVerified);
  const showEmailNudge =
    user.copilotConfirmedCount >= EMAIL_NUDGE_THRESHOLD &&
    !hasVerifiedEmail &&
    user.copilotEmailNudgeShownAt === null;

  return NextResponse.json({
    showOnboarding,
    showEmailNudge,
    hasMigratedActions: migratedCount > 0,
    confirmedCount: user.copilotConfirmedCount,
    threshold: EMAIL_NUDGE_THRESHOLD,
  });
}

/**
 * POST /api/user/copilot-onboarding
 * Header: x-zklogin-jwt
 * Body: { address, dismissed: 'onboarding' | 'email_nudge' }
 *
 * Idempotent — multiple POSTs are safe; we just stamp `now`.
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  let body: { address?: string; dismissed?: "onboarding" | "email_nudge" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.address || !isValidSuiAddress(body.address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (body.dismissed !== "onboarding" && body.dismissed !== "email_nudge") {
    return NextResponse.json({ error: "Invalid dismissed value" }, { status: 400 });
  }

  const now = new Date();
  const data =
    body.dismissed === "onboarding"
      ? { copilotMigrationNoticeShownAt: now }
      : { copilotEmailNudgeShownAt: now };

  await prisma.user.updateMany({
    where: { suiAddress: body.address },
    data,
  });

  return NextResponse.json({ ok: true });
}
