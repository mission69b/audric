import { NextResponse } from "next/server";
import { getServerFeatureFlags } from "@/lib/feature-flags";

export const runtime = "nodejs";

/**
 * GET /api/feature-flags
 * Returns the current server-side feature flag state. Public (no auth required) —
 * exposes booleans only, no sensitive config. Used by the client when build-time
 * NEXT_PUBLIC_* mirrors are unavailable or stale (e.g. during local dev where the
 * server env is the source of truth).
 *
 * Response: { copilot: { enabled: boolean } }
 *
 * Cache hint: short — env can change on redeploy.
 */
export async function GET() {
  const flags = getServerFeatureFlags();
  return NextResponse.json(flags, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
