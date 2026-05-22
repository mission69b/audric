import { type NextRequest, NextResponse } from "next/server";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSuiRpcUrl } from "@/lib/sui-rpc";
import { resolveSuinsCached, SuinsRpcError } from "@/lib/suins-cache";

/**
 * GET /api/identity/check?username=alice
 *
 * Returns whether `alice.audric.sui` is available to claim. Drives the
 * real-time availability indicator in the SPEC 10 Phase B.1 picker.
 *
 * Response shape (always 200 unless rate-limited / RPC degraded):
 *   { available: true }
 *   { available: false, reason: 'reserved' }
 *   { available: false, reason: 'taken' }
 *   { available: false, reason: 'invalid' }
 *   { available: false, reason: 'too-short' }
 *   { available: false, reason: 'too-long' }
 *
 * Error responses:
 *   400 { error } — missing/empty username param
 *   429 { error } — IP rate limit exceeded
 *   503 { error } — SuiNS RPC verification failed (caller should retry).
 *                   Picker MUST surface this as "Can't verify availability
 *                   right now, try again in a moment" rather than treating
 *                   the name as available — the on-chain ground-truth
 *                   check is load-bearing for collision safety.
 *
 * Validation is a 5-step funnel, cheapest to most expensive:
 *
 *   1. Length 3–20 (audric UX cap per SPEC 10 D3)
 *   2. Charset + hyphen rules (SuiNS protocol)         — both 1+2 in validateAudricLabel
 *   3. Reserved-name list (audric brand / system / squat-magnet)
 *   4. Postgres `User.username` unique check (fast, indexed) — same-Audric collision
 *   5. SuiNS RPC `suix_resolveNameServiceAddress(<label>.audric.sui)` — chain ground truth
 *
 * Each step short-circuits on hit. The DB check is structurally sufficient
 * for collision detection (SuiNS leaf creation is parent-permissioned, so
 * the audric host is the only writer to `*.audric.sui`) but the RPC check
 * stays as belt-and-suspenders against (a) future scenarios where a
 * leaf is created out-of-band by ops scripts, (b) state divergence between
 * Postgres and chain after a partial-failure mint, and (c) the spec's
 * locked acceptance criterion (D3 + spec § "Acceptance gates").
 *
 * Auth: unauthenticated. The "is this name taken" question reveals
 * nothing private (taken/free/reserved is public on-chain anyway via
 * SuiNS), and authentication would add friction during the signup flow
 * where the user doesn't have a Sui address yet (the picker runs BEFORE
 * the first leaf mint claims their Audric Passport identity). IP rate
 * limit prevents abuse but is sized for real typing speeds — see
 * RATE_LIMIT_MAX comment below for the post-launch calibration.
 *
 * [v0.7e Phase 2 / S.253 — 2026-05-22] Verbatim port from
 * apps/web/app/api/identity/check/route.ts. Web-v2 already has every
 * supporting lib (validate-label, reserved-usernames, sui-rpc,
 * rate-limit, suins-cache) — the route is import-path-only changes.
 * `SuinsRpcError` is re-imported from `@/lib/suins-cache` (web-v2's
 * re-export of the engine type) rather than `@t2000/engine` directly
 * to keep error-class identity unified with the cache layer.
 * `runtime` segment export dropped to satisfy `nextConfig.cacheComponents`.
 */

// [S18-F19, 2026-05-08 post-launch] Bumped 30 → 60 / 60s after the
// showcase 48h window showed legitimate fast-typers tripping the limit.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

const AUDRIC_PARENT_NAME = "audric.sui";

type CheckReason = "reserved" | "taken" | "invalid" | "too-short" | "too-long";

interface CheckResponse {
  available: boolean;
  reason?: CheckReason;
}

function fullHandle(label: string): string {
  return `${label}.${AUDRIC_PARENT_NAME}`;
}

function ipKey(req: NextRequest): string {
  // Vercel sets x-forwarded-for; locally we fall back to a constant so
  // the limiter still functions (single-tester won't trip 30/60s).
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function jsonResponse(body: CheckResponse, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

// [S.90] Structured request log shape — single console.log per request
// with the `[identity-check]` prefix so Vercel log search can pull them
// with one filter. See apps/web/app/api/identity/check/route.ts for the
// full field reference.
type Outcome =
  | "rate_limited"
  | "bad_input"
  | "invalid"
  | "reserved"
  | "taken_db"
  | "taken_chain"
  | "available"
  | "rpc_error";

interface RequestLog {
  dbMs?: number;
  ip: string;
  label: string;
  ms: number;
  outcome: Outcome;
  reason?: string;
  reqId: string;
  rpcError?: string;
  rpcMs?: number;
}

function emitLog(log: RequestLog): void {
  console.log(`[identity-check] ${JSON.stringify(log)}`);
}

function newReqId(): string {
  return Math.floor(Math.random() * 0xff_ff_ff_ff)
    .toString(16)
    .padStart(8, "0");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t0 = performance.now();
  const reqId = newReqId();
  const ip = ipKey(req);

  const limit = rateLimit(
    `identity-check:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  );
  if (!limit.success) {
    emitLog({
      reqId,
      ip,
      label: "?",
      outcome: "rate_limited",
      ms: performance.now() - t0,
    });
    return rateLimitResponse(
      limit.retryAfterMs ?? RATE_LIMIT_WINDOW_MS
    ) as NextResponse;
  }

  const raw = req.nextUrl.searchParams.get("username");
  if (!raw) {
    emitLog({
      reqId,
      ip,
      label: "?",
      outcome: "bad_input",
      ms: performance.now() - t0,
    });
    return NextResponse.json(
      { error: "Missing username parameter" },
      { status: 400 }
    );
  }

  const validation = validateAudricLabel(raw);
  if (!validation.valid) {
    emitLog({
      reqId,
      ip,
      label: raw.slice(0, 20),
      outcome: "invalid",
      reason: validation.reason,
      ms: performance.now() - t0,
    });
    return jsonResponse({ available: false, reason: validation.reason });
  }
  const label = validation.label;

  if (isReserved(label)) {
    emitLog({
      reqId,
      ip,
      label,
      outcome: "reserved",
      ms: performance.now() - t0,
    });
    return jsonResponse({ available: false, reason: "reserved" });
  }

  const dbT0 = performance.now();
  const existingUser = await prisma.user.findUnique({
    where: { username: label },
    select: { id: true },
  });
  const dbMs = performance.now() - dbT0;
  if (existingUser) {
    emitLog({
      reqId,
      ip,
      label,
      outcome: "taken_db",
      ms: performance.now() - t0,
      dbMs,
    });
    return jsonResponse({ available: false, reason: "taken" });
  }

  const handle = fullHandle(label);
  const rpcT0 = performance.now();
  let onChainAddress: string | null;
  try {
    onChainAddress = await resolveSuinsCached(handle, {
      suiRpcUrl: getSuiRpcUrl(),
    });
  } catch (err) {
    const rpcMs = performance.now() - rpcT0;
    const detail =
      err instanceof SuinsRpcError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown SuiNS RPC error";
    emitLog({
      reqId,
      ip,
      label,
      outcome: "rpc_error",
      ms: performance.now() - t0,
      dbMs,
      rpcMs,
      rpcError: detail.slice(0, 200),
    });
    return NextResponse.json(
      {
        error: `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
      },
      { status: 503 }
    );
  }
  const rpcMs = performance.now() - rpcT0;

  if (onChainAddress !== null) {
    emitLog({
      reqId,
      ip,
      label,
      outcome: "taken_chain",
      ms: performance.now() - t0,
      dbMs,
      rpcMs,
    });
    return jsonResponse({ available: false, reason: "taken" });
  }

  emitLog({
    reqId,
    ip,
    label,
    outcome: "available",
    ms: performance.now() - t0,
    dbMs,
    rpcMs,
  });
  return jsonResponse({ available: true });
}
