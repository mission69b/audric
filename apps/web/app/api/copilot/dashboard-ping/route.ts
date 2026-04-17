import { NextRequest, NextResponse } from "next/server";
import { validateJwt, isValidSuiAddress } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCopilotEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

/**
 * POST /api/copilot/dashboard-ping
 * Header: x-zklogin-jwt
 * Body: { address }
 *
 * Records that the user opened the dashboard. Used by the in-chat surface to
 * suppress the same suggestion if the user already saw it on the dashboard
 * within the last 24h (plan §7).
 *
 * Fire-and-forget — never blocks the dashboard render.
 */
export async function POST(request: NextRequest) {
  if (!isCopilotEnabled()) {
    return NextResponse.json({ ok: true });
  }

  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  let body: { address?: string };
  try {
    body = (await request.json()) as { address?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.address || !isValidSuiAddress(body.address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  await prisma.user.updateMany({
    where: { suiAddress: body.address },
    data: { lastDashboardVisitAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
