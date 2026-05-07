// ---------------------------------------------------------------------------
// Mint admission control — Option C (probabilistic concurrency cap).
//
// [S18-F14 — May 2026] Background
// ------------------------------
// May 7 mainnet load test (`scripts/loadtest/mint-load-test.ts`, profile
// `burst-50` = 50 wallets, 25 concurrent) returned only 4% success. The
// dominant failure mode was BlockVision Sui RPC 429s (45/50 errors), with
// a smaller share of shared-object contention on the audric.sui parent NFT.
// 24h BlockVision stats showed 19.07% rate-limit rate, 61.57% success,
// `/v2/sui/account/defiPortfolio` accounting for 79% of all calls.
//
// Why a counter (not a queue / not a token bucket)
// ------------------------------------------------
// A queue (Option A in the trade-off doc) requires job persistence,
// background workers, and UI dependencies on poll endpoints — too much
// surface to ship under the burst pressure of "100-1000 users today."
// A token bucket assumes a known refill rate; the bottleneck is BlockVision
// + Sui registry contention which is opaque from our side.
//
// A simple in-flight counter is the smallest viable fix:
//   1. Increment a Redis counter on entry.
//   2. If counter > MAX_CONCURRENT_MINTS, decrement immediately and 503.
//   3. Otherwise proceed with mint.
//   4. Always decrement on exit (success / failure / throw).
//
// "Probabilistic" because we don't synchronize check + increment as one
// atomic op (Upstash INCR is atomic, but the limit comparison is not). At
// the burst sizes we actually expect (max ~25 concurrent mints), the
// drift is bounded by the burst duration, not the counter accuracy. Worst
// case: a few extra mints leak through; load-test data shows 25 concurrent
// → 4% success, so even a 5x drift gives 5x bandwidth, not catastrophe.
//
// Limit value (5)
// ---------------
// Empirical, not derived. The May 7 load test showed:
//   - 25 concurrent → 4% success (BlockVision RPC saturated)
//   - 5 concurrent (extrapolated from earlier 5-wallet smoke test) → 80% success
// 5 keeps each worker's BlockVision call rate below the per-API-key burst
// limit while leaving headroom for the read-side picker checks running in
// parallel on the same key. Tunable via env without redeploy if we observe
// either too many 503s (loosen) or too many on-chain reverts (tighten).
//
// Failure mode
// ------------
// If Redis is unreachable, we FAIL OPEN (admit the request). The
// alternative — fail closed on Redis outage — would block ALL mints
// until Redis recovers, a significantly worse user experience than the
// current "BlockVision absorbs the burst, some mints fail" baseline.
// ---------------------------------------------------------------------------

import { redis } from '@/lib/redis';
import { env } from '@/lib/env';

const COUNTER_KEY = 'identity-reserve:in-flight';
const COUNTER_TTL_SEC = 60; // expire abandoned counters; tx + DB writes finish well under this
const DEFAULT_MAX_CONCURRENT_MINTS = 5;

/**
 * Resolve the admission cap from env (`AUDRIC_MINT_CONCURRENCY_LIMIT`)
 * with a documented fallback. Reading inside the helper (not at module
 * load) lets us tune live via Vercel env without a redeploy.
 */
function getMaxConcurrent(): number {
  const raw = env.AUDRIC_MINT_CONCURRENCY_LIMIT;
  if (!raw) return DEFAULT_MAX_CONCURRENT_MINTS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    console.warn(
      `[admission-control] Invalid AUDRIC_MINT_CONCURRENCY_LIMIT="${raw}", falling back to ${DEFAULT_MAX_CONCURRENT_MINTS}`,
    );
    return DEFAULT_MAX_CONCURRENT_MINTS;
  }
  return parsed;
}

export interface AdmissionResult {
  /** True if the caller may proceed with the mint. False = caller MUST 503. */
  admitted: boolean;
  /**
   * Current observed in-flight count (after this caller's increment if admitted,
   * or the value that caused rejection if not admitted). Useful for logging.
   */
  inFlight: number;
  /**
   * Recommended Retry-After in seconds (exponential-ish suggestion to spread
   * the burst). Only set when admitted=false.
   */
  retryAfterSec?: number;
  /**
   * Caller MUST invoke this after the mint completes (success OR failure)
   * IFF admitted=true. No-op when admitted=false.
   */
  release(): Promise<void>;
}

/**
 * Try to admit a mint request. Always returns — never throws.
 *
 * Usage:
 *   const admission = await tryAdmitMint();
 *   if (!admission.admitted) return 503;
 *   try { ...mint... } finally { await admission.release(); }
 */
export async function tryAdmitMint(): Promise<AdmissionResult> {
  const limit = getMaxConcurrent();

  let inFlight: number;
  try {
    inFlight = await redis.incr(COUNTER_KEY);
    // Refresh the TTL so an abandoned counter (e.g. process killed before
    // release) can self-heal. EXPIRE is a separate command, but we're not
    // racing for correctness — at worst we extend TTL by a few extra seconds.
    await redis.expire(COUNTER_KEY, COUNTER_TTL_SEC);
  } catch (err) {
    // Fail open — Redis outage shouldn't take down mints.
    console.error(
      '[admission-control] Redis INCR failed, failing OPEN:',
      err instanceof Error ? err.message : err,
    );
    return {
      admitted: true,
      inFlight: -1,
      release: async () => {
        // No-op: if INCR failed, DECR would also fail and we can't reliably release.
      },
    };
  }

  if (inFlight > limit) {
    // Decrement immediately so we don't leave a phantom slot.
    try {
      await redis.decr(COUNTER_KEY);
    } catch (err) {
      console.error(
        '[admission-control] Redis DECR (rejection cleanup) failed:',
        err instanceof Error ? err.message : err,
      );
    }
    // Suggested back-off: pick a small random jitter (2–8s) to spread the
    // retry burst across the next window instead of all clients hammering
    // simultaneously when the counter drains.
    const jitterSec = 2 + Math.floor(Math.random() * 6);
    return {
      admitted: false,
      inFlight,
      retryAfterSec: jitterSec,
      release: async () => undefined,
    };
  }

  return {
    admitted: true,
    inFlight,
    release: async () => {
      try {
        await redis.decr(COUNTER_KEY);
      } catch (err) {
        console.error(
          '[admission-control] Redis DECR (release) failed — counter may drift until TTL:',
          err instanceof Error ? err.message : err,
        );
      }
    },
  };
}

/**
 * Build the 503 response when a request is rejected. Centralised so the
 * shape stays consistent (matches `rateLimitResponse` for client parity).
 */
export function admissionRejectedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: "We're at capacity right now. Please try again in a moment.",
      reason: 'capacity',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}

/**
 * Test-only: reset the in-flight counter. Production code MUST NOT call this.
 */
export async function _resetAdmissionForTests(): Promise<void> {
  try {
    await redis.del(COUNTER_KEY);
  } catch {
    // Best-effort in tests.
  }
}
