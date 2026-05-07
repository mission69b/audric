import { resolveSuinsViaRpc, SuinsRpcError } from '@t2000/engine';

/**
 * In-memory cache for SuiNS handle → address resolution.
 *
 * ## Why this exists (S18-F9 / vercel-logs L8 — May 2026)
 *
 * The 12h Vercel log triage surfaced 77 SuiNS lookup failures for ONE
 * handle (`adeniyi.audric.sui`) in `/[username]/page.tsx` server renders.
 * One popular profile (or scraper) was driving repeated RPC calls per page
 * hit, periodically hitting BlockVision's per-IP rate limit. Each 429
 * degraded the page render to 404 (per the `notFound()` fallback) until
 * the burst cleared — so a real popular profile would intermittently
 * appear "deleted" to its own visitors during traffic spikes.
 *
 * ## Cache policy
 *
 * - Positive entries (handle → address): cached for {@link POSITIVE_TTL_MS}.
 *   SuiNS leaf resolutions are stable on the order of days unless the user
 *   explicitly revokes / re-mints, so a 5-minute window is conservative.
 *
 * - Negative entries (handle → null, "not found"): cached for
 *   {@link NEGATIVE_TTL_MS}. Shorter window so a newly-minted handle
 *   appears within ~30s of mint, without forcing a deploy. Tradeoff: the
 *   `/api/identity/reserve` route can't synchronously invalidate the cache
 *   for the new handle (no shared cross-Lambda cache), but the 30s ceiling
 *   means any visitor hitting the page before then sees a 404 → reload →
 *   resolves. Acceptable UX.
 *
 * - Error entries (RPC threw): NOT cached. The caller treats them like
 *   `null`, but on the next request we'll re-attempt the lookup (in case
 *   it was a transient blip). Caching errors would mask real outages.
 *
 * ## What this is NOT
 *
 * - Not a Redis / Vercel KV cache — strictly per-Lambda-instance. Vercel
 *   Lambdas can be warm for ~15min so cache hit rate is bounded by the
 *   container's lifetime + traffic distribution. Acceptable for popular-
 *   profile burst absorption (the original problem); not designed to
 *   eliminate ALL RPC calls.
 *
 * - Not invalidated by the reserve / change-username routes. Handle
 *   ownership flips are infrequent and a 5-minute window self-corrects.
 *   Adding cross-Lambda invalidation would require Redis / KV — out of
 *   scope for the demo-eve surgical fix.
 *
 * - Not used by any client-facing reads (browser → Sui RPC). This module
 *   only wraps the SERVER-SIDE call from `app/[username]/page.tsx` and
 *   `app/api/identity/reserve/route.ts`'s pre-mint check.
 */

const POSITIVE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_TTL_MS = 30 * 1000; // 30 seconds

interface CacheEntry {
  /** Resolved address, or `null` for "checked, no leaf". */
  result: string | null;
  /** ms timestamp when the entry expires. */
  expiresAt: number;
}

/**
 * Module-scoped cache. Per-Lambda-instance — Vercel Lambdas keep state in
 * memory while warm, so consecutive requests within the same container
 * share the cache.
 */
const cache = new Map<string, CacheEntry>();

/**
 * Cached wrapper around `resolveSuinsViaRpc`. Same signature as the
 * underlying function except it returns a tagged result so the caller can
 * distinguish "checked, no leaf" (`null`) from "RPC threw" (`undefined`).
 *
 * @returns
 *   - `string` — resolved address (cached positive)
 *   - `null`   — handle resolved to no-leaf (cached negative)
 *   - throws   — propagates the SuinsRpcError so the caller can render an
 *                appropriate error state (matches uncached behavior)
 */
export async function resolveSuinsCached(
  handle: string,
  opts: { suiRpcUrl: string },
): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(handle);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  // Cache miss OR expired — re-fetch. Do NOT catch errors here; the caller
  // (page render or pre-mint check) needs to know if the RPC failed vs.
  // returned a clean null.
  const result = await resolveSuinsViaRpc(handle, { suiRpcUrl: opts.suiRpcUrl });

  cache.set(handle, {
    result,
    expiresAt: now + (result === null ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS),
  });

  return result;
}

/**
 * Test-only: clear the in-memory cache. Exposed for unit tests; do NOT
 * call from production code paths.
 */
export function _resetSuinsCacheForTests(): void {
  cache.clear();
}

// Re-export the error class so callers don't need a separate import.
export { SuinsRpcError };
