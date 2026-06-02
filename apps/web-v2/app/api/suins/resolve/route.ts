import { SuinsRpcError } from "@t2000/engine";
import { type NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSuiRpcUrl } from "@/lib/sui-rpc";
import { resolveSuinsCached } from "@/lib/suins-cache";

/**
 * GET /api/suins/resolve?name=<name>.sui
 *
 * Resolves a SuiNS name to its target Sui address, reusing the SAME cached
 * resolver as the public profile page (`resolveSuinsCached` — 5min positive
 * / 10s negative TTL, live-RPC fallback). Powers the Withdraw modal's "To"
 * field so users can send to `name@audric` / `name.sui` instead of pasting
 * a raw 0x address.
 *
 * The Audric handle `alice@audric` maps to the on-chain SuiNS form
 * `alice.audric.sui`; callers normalize that before hitting this route, so
 * this endpoint only ever sees fully-qualified `*.sui` names.
 *
 * Returns `{ address: string | null }` — `null` means "checked, no leaf".
 */

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const SUINS_NAME_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.sui$/;

export function GET(req: NextRequest): Promise<NextResponse> | NextResponse {
  const name = req.nextUrl.searchParams.get("name")?.trim().toLowerCase();
  if (!name || !SUINS_NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "Provide a valid SuiNS name (e.g. alice.sui)." },
      { status: 400 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(
    `suins-resolve:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rl.success) {
    return rateLimitResponse(
      rl.retryAfterMs ?? RATE_LIMIT_WINDOW_MS
    ) as NextResponse;
  }

  return resolveName(name);
}

async function resolveName(name: string): Promise<NextResponse> {
  try {
    const address = await resolveSuinsCached(name, {
      suiRpcUrl: getSuiRpcUrl(),
    });
    return NextResponse.json({ address: address ?? null });
  } catch (err) {
    const detail =
      err instanceof SuinsRpcError
        ? err.message
        : err instanceof Error
          ? err.message
          : "unknown";
    console.warn(`[/api/suins/resolve] lookup failed for "${name}": ${detail}`);
    return NextResponse.json({ error: "Resolution failed." }, { status: 502 });
  }
}
