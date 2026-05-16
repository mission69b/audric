import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import {
  authenticateRequest,
  assertOwnsOrWatched,
  type VerifiedJwt,
} from '@/lib/auth';

/**
 * Validate the x-internal-key header against T2000_INTERNAL_KEY.
 * Used by internal API routes called by the t2000 ECS cron/indexer.
 *
 * `env.T2000_INTERNAL_KEY` is required by the env schema, so the
 * "not configured" branch can no longer fire at runtime — boot would
 * have failed first. Kept the invariant explicit because Next runs
 * code paths during build/type-check where the proxy could in theory
 * miss a key.
 */
export function validateInternalKey(
  headerValue: string | null,
): { valid: true } | { error: NextResponse } {
  const expected = env.T2000_INTERNAL_KEY;

  if (!headerValue || headerValue !== expected) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      ),
    };
  }

  return { valid: true };
}

/**
 * Dual-auth gate for analytics read routes that BOTH a browser session
 * AND a server-side trusted caller (the `@t2000/engine` agent tools,
 * the cron) need to hit.
 *
 * Returns either:
 *   - `{ address, isInternal: true }` — caller proved `x-internal-key`
 *     match; trusted to read any address in the query string.
 *   - `{ address, isInternal: false, verified }` — caller proved a
 *     valid zkLogin JWT and either reads their own wallet OR a
 *     watched-address from their `WatchAddress` list.
 *   - `{ error }` — pre-built `NextResponse` for the caller (401 / 403
 *     / 400 depending on which leg failed).
 *
 * ## Why this exists
 *
 * SPEC 30 Phase 1A.5 hardened the analytics surfaces to JWT-only — the
 * pre-fix `x-sui-address` header was forgeable from the browser. That
 * change was correct for browser callers but quietly broke the engine
 * path: engine tools run server-side inside the audric Next.js process
 * and have no JWT to attach. They were silently 401-ing and returning
 * empty rollups to the LLM, which then narrated "no activity this
 * month" even when the user had transacted earlier the same day
 * (founder-reported, May 2026; see BENEFITS_SPEC_v07a.md Day 20d).
 *
 * The mirror pattern already exists on
 * `/api/analytics/weekly-summary` (added when the t2000 cron started
 * pulling weekly recaps). This helper extracts that pattern so we
 * don't copy-paste it across 5+ routes. New analytics routes that
 * need dual access SHOULD route through this helper instead of
 * inlining the branch.
 *
 * ## Security model
 *
 * The internal-key path is server-only — `T2000_INTERNAL_KEY` lives
 * in env (Vercel encrypted env vars), is never sent to the client,
 * and is required by the env schema (boot fails if missing). Adding
 * the internal-key branch does NOT loosen the IDOR posture: browsers
 * cannot send this header (no path through the client), so the only
 * callers are server-side processes that already have a server
 * secret. SPEC 30's "forgeable header" critique applied to
 * `x-sui-address`, not to `x-internal-key`.
 *
 * The JWT branch is unchanged: `authenticateRequest` + the existing
 * `assertOwnsOrWatched` ownership check. Same enforcement as before.
 *
 * ## What this helper does NOT do
 *
 * - Does NOT cover write routes — sponsored-tx and other write
 *   surfaces still require the full JWT verify + per-address
 *   ownership check via `authenticateRequest` + `assertOwns`.
 * - Does NOT cover the internal-only ECS cron routes
 *   (`/api/internal/*`) — those continue to use `validateInternalKey`
 *   above (no JWT branch at all).
 *
 * The line between "dual-auth analytics" and "internal-only" is
 * deliberate: analytics reads are useful from both browser and
 * engine, but the internal/* surfaces should never be reachable from
 * a browser even with a valid JWT.
 */
export async function authenticateAnalyticsRequest(
  request: NextRequest,
): Promise<
  | { address: string; isInternal: true }
  | { address: string; isInternal: false; verified: VerifiedJwt }
  | { error: NextResponse }
> {
  const internalKey = request.headers.get('x-internal-key');
  if (internalKey && internalKey === env.T2000_INTERNAL_KEY) {
    const queryAddr = request.nextUrl.searchParams.get('address');
    if (!queryAddr || !queryAddr.startsWith('0x')) {
      return {
        error: NextResponse.json(
          { error: 'Internal-key callers must supply ?address=0x…' },
          { status: 400 },
        ),
      };
    }
    return { address: queryAddr, isInternal: true };
  }

  const auth = await authenticateRequest(request);
  if ('error' in auth) return { error: auth.error };

  const queryAddr =
    request.nextUrl.searchParams.get('address') ?? auth.verified.suiAddress;
  const ownership = await assertOwnsOrWatched(auth.verified, queryAddr);
  if (ownership) return { error: ownership };

  return { address: queryAddr, isInternal: false, verified: auth.verified };
}
