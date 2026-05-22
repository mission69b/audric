// ---------------------------------------------------------------------------
// Mint admission control — Option C (probabilistic concurrency cap).
//
// [S18-F14 — May 2026] Background
// ------------------------------
// May 7 mainnet load test (`scripts/loadtest/mint-load-test.ts`, profile
// `burst-50` = 50 wallets, 25 concurrent) returned only 4% success. The
// dominant failure mode was BlockVision Sui RPC 429s (45/50 errors), with
// a smaller share of shared-object contention on the audric.sui parent NFT.
//
// Why a counter (not a queue / not a token bucket)
// ------------------------------------------------
// A simple in-flight counter is the smallest viable fix:
//   1. Increment a Redis counter on entry.
//   2. If counter > MAX_CONCURRENT_MINTS, decrement immediately and 503.
//   3. Otherwise proceed with mint.
//   4. Always decrement on exit (success / failure / throw).
//
// Limit value (5)
// ---------------
// Empirical, not derived. The May 7 load test showed:
//   - 25 concurrent → 4% success (BlockVision RPC saturated)
//   - 5 concurrent (extrapolated) → 80% success
// 5 keeps each worker's BlockVision call rate below the per-API-key burst
// limit while leaving headroom for the read-side picker checks running in
// parallel on the same key. Tunable via env without redeploy.
//
// Failure mode
// ------------
// If Upstash is unreachable OR not configured, we FAIL OPEN (admit the
// request). Web-v2's `lib/upstash.ts` exports `null` when Upstash REST vars
// are absent — same fail-open posture as the Redis-outage path. The
// alternative — fail closed on Upstash outage — would block ALL mints
// until Upstash recovers, a significantly worse user experience than the
// current "BlockVision absorbs the burst, some mints fail" baseline.
//
// [v0.7e Phase 2 / S.253 — 2026-05-22] Verbatim port from
// apps/web/lib/identity/admission-control.ts. The lone divergence from
// apps/web: that app injects a non-null `redis` from `lib/redis.ts`
// (Redis.fromEnv() at module load), while web-v2's `upstash` is nullable
// — the helper checks for null at call time and fails open uniformly.
// ---------------------------------------------------------------------------

import { env } from "@/lib/env";
import { upstash } from "@/lib/upstash";

const COUNTER_KEY = "identity-reserve:in-flight";
const COUNTER_TTL_SEC = 60;
const DEFAULT_MAX_CONCURRENT_MINTS = 5;

/**
 * Resolve the admission cap from env (`AUDRIC_MINT_CONCURRENCY_LIMIT`)
 * with a documented fallback. Reading inside the helper (not at module
 * load) lets us tune live via Vercel env without a redeploy.
 */
function getMaxConcurrent(): number {
  const raw = env.AUDRIC_MINT_CONCURRENCY_LIMIT;
  if (!raw) {
    return DEFAULT_MAX_CONCURRENT_MINTS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    console.warn(
      `[admission-control] Invalid AUDRIC_MINT_CONCURRENCY_LIMIT="${raw}", falling back to ${DEFAULT_MAX_CONCURRENT_MINTS}`
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
   * Caller MUST invoke this after the mint completes (success OR failure)
   * IFF admitted=true. No-op when admitted=false.
   */
  release(): Promise<void>;
  /**
   * Recommended Retry-After in seconds (small jittered suggestion to spread
   * the burst). Only set when admitted=false.
   */
  retryAfterSec?: number;
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
  // [S.253] Fail open when Upstash is not configured at all (preview /
  // local dev). Same posture as the Redis-outage path below.
  if (!upstash) {
    return {
      admitted: true,
      inFlight: -1,
      release: async () => undefined,
    };
  }

  const limit = getMaxConcurrent();

  let inFlight: number;
  try {
    inFlight = await upstash.incr(COUNTER_KEY);
    await upstash.expire(COUNTER_KEY, COUNTER_TTL_SEC);
  } catch (err) {
    console.error(
      "[admission-control] Upstash INCR failed, failing OPEN:",
      err instanceof Error ? err.message : err
    );
    return {
      admitted: true,
      inFlight: -1,
      release: async () => undefined,
    };
  }

  if (inFlight > limit) {
    try {
      await upstash.decr(COUNTER_KEY);
    } catch (err) {
      console.error(
        "[admission-control] Upstash DECR (rejection cleanup) failed:",
        err instanceof Error ? err.message : err
      );
    }
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
        if (upstash) {
          await upstash.decr(COUNTER_KEY);
        }
      } catch (err) {
        console.error(
          "[admission-control] Upstash DECR (release) failed — counter may drift until TTL:",
          err instanceof Error ? err.message : err
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
      reason: "capacity",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  );
}
