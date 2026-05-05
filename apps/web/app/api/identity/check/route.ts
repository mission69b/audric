import { NextRequest, NextResponse } from 'next/server';
import { resolveSuinsViaRpc, SuinsRpcError } from '@t2000/engine';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
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
 * limit prevents abuse: 30 requests / 60s — generous enough for typing-
 * debounced "checking..." flows but bounded enough to stop a script.
 */

const RATE_LIMIT_MAX = 30;
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const limit = rateLimit(`identity-check:${ipKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.success) {
    return rateLimitResponse(limit.retryAfterMs ?? RATE_LIMIT_WINDOW_MS) as NextResponse;
  }

  const raw = req.nextUrl.searchParams.get('username');
  if (!raw) {
    return NextResponse.json(
      { error: 'Missing username parameter' },
      { status: 400 },
    );
  }

  // Steps 1+2: length + charset/hyphen rules. validateAudricLabel returns
  // the canonical lowercase/trimmed form on success; reuse it downstream.
  const validation = validateAudricLabel(raw);
  if (!validation.valid) {
    return jsonResponse({ available: false, reason: validation.reason });
  }
  const label = validation.label;

  // Step 3: reserved list (audric-side product policy). Cheap Set lookup.
  if (isReserved(label)) {
    return jsonResponse({ available: false, reason: 'reserved' });
  }

  // Step 4: Postgres unique check. Indexed; sub-ms in practice. Catches
  // every same-Audric collision and gives the picker fail-fast feedback
  // before the more expensive RPC call.
  const existingUser = await prisma.user.findUnique({
    where: { username: label },
    select: { id: true },
  });
  if (existingUser) {
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
  let onChainAddress: string | null;
  try {
    onChainAddress = await resolveSuinsViaRpc(handle, {
      suiRpcUrl: getSuiRpcUrl(),
    });
  } catch (err) {
    const detail =
      err instanceof SuinsRpcError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown SuiNS RPC error';
    return NextResponse.json(
      {
        error: `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
      },
      { status: 503 },
    );
  }

  if (onChainAddress !== null) {
    // A leaf already resolves to an address on-chain — the name is taken.
    return jsonResponse({ available: false, reason: 'taken' });
  }

  return jsonResponse({ available: true });
}
