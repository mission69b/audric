import { NextRequest, NextResponse } from "next/server";
import { validateJwt, isValidSuiAddress } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface CopilotPrefsResponse {
  digestEnabled: boolean;
  digestSendHourLocal: number;
  hfWidgetEnabled: boolean;
}

/**
 * GET /api/user/copilot-prefs?address=0x...
 *
 * Returns the user's Copilot preferences (digest opt-in, send hour, HF widget).
 * Falls back to schema defaults when the User row doesn't exist yet — keeps
 * the settings page rendering for fresh wallets.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get("address");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: {
      digestEnabled: true,
      digestSendHourLocal: true,
      hfWidgetEnabled: true,
    },
  });

  const response: CopilotPrefsResponse = user ?? {
    digestEnabled: true,
    digestSendHourLocal: 8,
    hfWidgetEnabled: true,
  };

  return NextResponse.json(response);
}

/**
 * PATCH /api/user/copilot-prefs
 *
 * Body: { address, digestEnabled?, digestSendHourLocal?, hfWidgetEnabled? }
 * Updates whichever fields are provided. Each field is independently optional
 * so the toggle UI can call this for one field at a time without re-sending
 * the others (and risking stale-state writes).
 */
export async function PATCH(request: NextRequest) {
  const jwt = request.headers.get("x-zklogin-jwt");
  const jwtResult = validateJwt(jwt);
  if ("error" in jwtResult) return jwtResult.error;

  let body: {
    address?: string;
    digestEnabled?: boolean;
    digestSendHourLocal?: number;
    hfWidgetEnabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { address, digestEnabled, digestSendHourLocal, hfWidgetEnabled } = body;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (digestSendHourLocal !== undefined) {
    if (
      !Number.isInteger(digestSendHourLocal) ||
      digestSendHourLocal < 0 ||
      digestSendHourLocal > 23
    ) {
      return NextResponse.json(
        { error: "digestSendHourLocal must be an integer 0–23" },
        { status: 400 },
      );
    }
  }

  const update: {
    digestEnabled?: boolean;
    digestSendHourLocal?: number;
    hfWidgetEnabled?: boolean;
  } = {};
  if (typeof digestEnabled === "boolean") update.digestEnabled = digestEnabled;
  if (digestSendHourLocal !== undefined) update.digestSendHourLocal = digestSendHourLocal;
  if (typeof hfWidgetEnabled === "boolean") update.hfWidgetEnabled = hfWidgetEnabled;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { suiAddress: address },
    update,
    create: { suiAddress: address, ...update },
    select: {
      digestEnabled: true,
      digestSendHourLocal: true,
      hfWidgetEnabled: true,
    },
  });

  return NextResponse.json(user satisfies CopilotPrefsResponse);
}
