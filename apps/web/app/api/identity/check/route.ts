import { NextRequest, NextResponse } from 'next/server';
import { SuinsRpcError } from '@t2000/engine';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import { resolveSuinsCached } from '@/lib/suins-cache';
import { isReserved } from '@/lib/identity/reserved-usernames';
import { validateAudricLabel } from '@/lib/identity/validate-label';

export const runtime = 'nodejs';

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
 */

// [S18-F19, 2026-05-08 post-launch] Bumped 30 → 60 / 60s after the
// showcase 48h window showed legitimate fast-typers tripping the limit.
// The picker fans out 3 parallel suggestion pre-checks on mount, then
// the user's debounced free-text checks fire on every keystroke that
// passes local validation; a normal "type a name + tab to claim" flow
// can land 8–12 requests inside the same minute, and a name-shopping
// user (`adeniyi` → `adeniyi-eth` → `adeniyi-1` → ...) can easily
// double that. The endpoint is cheap — DB unique-check is sub-ms
// indexed, SuiNS RPC is Upstash-cached at 5min positive / 10s negative.
// 60/min still stops scripts cold but accommodates the real burst
// pattern observed under the 530-signups-in-48h load.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

const AUDRIC_PARENT_NAME = 'audric.sui';

type CheckReason = 'reserved' | 'taken' | 'invalid' | 'too-short' | 'too-long';

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
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

function jsonResponse(body: CheckResponse, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

// ---------------------------------------------------------------------------
// [S.90] Structured request log shape.
//
// Emitted as a single console.log per request with the prefix
// `[identity-check]` so Vercel log search can pull them with one filter.
// JSON shape so future log-pipeline ingest (Logflare, Axiom, Datadog) can
// parse without regex. Fields:
//   - reqId — random 8-char hex; correlates concurrent picker fan-outs
//     (3 parallel calls share the same `ip` + ~ms-aligned `t`).
//   - ip — same key the rate-limiter uses (x-forwarded-for first hop or
//     "local"); enables "this IP made N requests in window" queries.
//   - label — the post-validation handle (or '?' when rejected at parse).
//   - outcome — terminal status: rate_limited | bad_input | invalid |
//     reserved | taken_db | taken_chain | available | rpc_error.
//   - reason — only set when outcome ∈ {invalid, taken_db, taken_chain}
//     to disambiguate validation failure modes (too-short / too-long /
//     invalid charset).
//   - ms — wall-clock total request duration (rate-limit check → response
//     send), measured via performance.now().
//   - dbMs — Postgres unique-check duration, only set when reached.
//   - rpcMs — SuiNS RPC duration, only set when reached.
//   - rpcError — the underlying RPC failure detail when outcome is
//     rpc_error (truncated to 200 chars to bound log size).
// ---------------------------------------------------------------------------
type Outcome =
  | 'rate_limited'
  | 'bad_input'
  | 'invalid'
  | 'reserved'
  | 'taken_db'
  | 'taken_chain'
  | 'available'
  | 'rpc_error';

interface RequestLog {
  reqId: string;
  ip: string;
  label: string;
  outcome: Outcome;
  reason?: string;
  ms: number;
  dbMs?: number;
  rpcMs?: number;
  rpcError?: string;
}

function emitLog(log: RequestLog): void {
  // Single-line JSON. Vercel captures stdout; downstream ingest (Logflare /
  // Axiom / etc.) can filter on the prefix and JSON.parse the payload.
  console.log(`[identity-check] ${JSON.stringify(log)}`);
}

function newReqId(): string {
  // 8-char hex — enough to disambiguate within a 1-minute window of
  // requests from the same IP without bloating the log line.
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // [S.90] Per-request timing + structured log. Captures the end-to-end
  // budget AND the SuiNS RPC slice so the next "CHECK FAILED" report
  // (cf. S.88) has data instead of guesses. See the RequestLog type
  // comment above for field meanings.
  const t0 = performance.now();
  const reqId = newReqId();
  const ip = ipKey(req);

  const limit = rateLimit(`identity-check:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.success) {
    emitLog({ reqId, ip, label: '?', outcome: 'rate_limited', ms: performance.now() - t0 });
    return rateLimitResponse(limit.retryAfterMs ?? RATE_LIMIT_WINDOW_MS) as NextResponse;
  }

  const raw = req.nextUrl.searchParams.get('username');
  if (!raw) {
    emitLog({ reqId, ip, label: '?', outcome: 'bad_input', ms: performance.now() - t0 });
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400 },
    );
  }

  // Steps 1+2: length + charset/hyphen rules. validateAudricLabel returns
  // the canonical lowercase/trimmed form on success; reuse it downstream.
  const validation = validateAudricLabel(raw);
  if (!validation.valid) {
    emitLog({
      reqId,
      ip,
      label: raw.slice(0, 20),
      outcome: 'invalid',
      reason: validation.reason,
      ms: performance.now() - t0,
    });
    return jsonResponse({ available: false, reason: validation.reason });
  }
  const label = validation.label;

  // Step 3: reserved list (audric-side product policy). Cheap Set lookup.
  if (isReserved(label)) {
    emitLog({ reqId, ip, label, outcome: 'reserved', ms: performance.now() - t0 });
    return jsonResponse({ available: false, reason: 'reserved' });
  }

  // Step 4: Postgres unique check. Indexed; sub-ms in practice. Catches
  // every same-Audric collision and gives the picker fail-fast feedback
  // before the more expensive RPC call.
  const dbT0 = performance.now();
  const existingUser = await prisma.user.findUnique({
    where: { username: label },
    select: { id: true },
  });
  const dbMs = performance.now() - dbT0;
  if (existingUser) {
    emitLog({ reqId, ip, label, outcome: 'taken_db', ms: performance.now() - t0, dbMs });
    return jsonResponse({ available: false, reason: 'taken' });
  }

  // Step 5: SuiNS RPC ground-truth check. Even though leaf creation is
  // parent-permissioned (i.e. the audric host is the only writer to
  // `*.audric.sui`), the on-chain check defends against:
  //   - Out-of-band leaves created by ops scripts during incident response
  //   - State divergence between Postgres and chain after a partial-failure
  //     mint where the on-chain tx confirmed but the DB write didn't
  //   - Race conditions during high-traffic signup windows
  // Fail-CLOSED on RPC error: surface 503 so the picker can retry rather
  // than incorrectly tell the user "available" → mint → on-chain race.
  const handle = fullHandle(label);
  const rpcT0 = performance.now();
  let onChainAddress: string | null;
  try {
    // [S18-F12] Use the Upstash-shared cached resolver — picker debounce
    // typically fires 3 checks per typed handle (debounce 300ms), and a
    // claimed handle's reverse-resolve doesn't change second-to-second.
    // Cache hits cut RPC volume by ~90%+ during the picker dance and
    // share the warm entry with /[username] page renders + reserve.
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
          : 'Unknown SuiNS RPC error';
    emitLog({
      reqId,
      ip,
      label,
      outcome: 'rpc_error',
      ms: performance.now() - t0,
      dbMs,
      rpcMs,
      rpcError: detail.slice(0, 200),
    });
    return NextResponse.json(
      {
        error: `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
      },
      { status: 503 },
    );
  }
  const rpcMs = performance.now() - rpcT0;

  if (onChainAddress !== null) {
    // A leaf already resolves to an address on-chain — the name is taken.
    emitLog({
      reqId,
      ip,
      label,
      outcome: 'taken_chain',
      ms: performance.now() - t0,
      dbMs,
      rpcMs,
    });
    return jsonResponse({ available: false, reason: 'taken' });
  }

  emitLog({
    reqId,
    ip,
    label,
    outcome: 'available',
    ms: performance.now() - t0,
    dbMs,
    rpcMs,
  });
  return jsonResponse({ available: true });
}
