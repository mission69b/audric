import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { env } from "@/lib/env";

// [P2.5 / S.285 — 2026-05-24] Redis-backed IP rate limit for /api/chat.
//
// Policy: 30 messages / 60 seconds / IP. Widened from the in-memory
// limiter's 20/60s (lib/rate-limit.ts) — the +10 headroom prevents
// false positives on legitimate fast-typers (e.g., the HITL resume
// pattern where one user can hit the route from multiple tabs
// concurrently per the route.ts comment on IP-keying).
//
// Previously: 10/hour. That came from the audric/web original where
// /api/chat ran a heavier model; with the v0.7e flip to streaming
// chat the 10/hr limit was unreachable in normal use AND useless for
// brief burst protection (no upper bound on burst rate within an hour).
//
// Cold-start safe (Redis is shared across Vercel instances) — replaces
// the per-instance counter that wiped on every cold start.
//
// Degrades OPEN if Redis is unavailable (preview deploys, transient
// connection failures) — same posture as the in-memory limiter, which
// has no persistence. Trade-off: in a Redis outage, we lose burst
// protection but stay available. Acceptable given Anthropic's own
// per-key rate limit + the env-gate validation at boot.
const MAX_MESSAGES = 30;
const WINDOW_SECONDS = 60;

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  // [S.269 item 5 — 2026-05-23] Read through the env gate (`env.REDIS_URL`)
  // instead of `process.env.REDIS_URL` directly. The gate normalizes
  // empty strings to `undefined` (S.20 BV-incident bug class) and keeps
  // the audit's "no raw process.env reads" finding closed.
  if (!client && env.REDIS_URL) {
    client = createClient({ url: env.REDIS_URL });
    client.on("error", () => undefined);
    client.connect().catch(() => {
      client = null;
    });
  }
  return client;
}

export type RateLimitResult =
  | { success: true }
  | { success: false; retryAfterSec: number };

/**
 * Check whether the given IP is allowed to make a request right now.
 *
 * Returns `{ success: true }` when allowed. Returns
 * `{ success: false, retryAfterSec }` when the limit is hit — caller
 * is responsible for emitting the 429 response (typically with a
 * `Retry-After` header). The async-result pattern (instead of
 * throwing) keeps the call site composable with the existing chat
 * route 429 emission.
 *
 * Degrades OPEN (returns success) when:
 *   - Not in production (dev / preview can spam freely)
 *   - IP header is missing (proxy misconfig — fail open, not closed)
 *   - Redis is unavailable (preview without REDIS_URL, transient outage)
 *   - The Redis transaction itself throws (logged, not propagated)
 */
export async function checkIpRateLimit(
  ip: string | undefined
): Promise<RateLimitResult> {
  if (!isProductionEnvironment || !ip) {
    return { success: true };
  }

  const redis = getClient();
  if (!redis?.isReady) {
    return { success: true };
  }

  try {
    const key = `ip-rate-limit:${ip}`;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, WINDOW_SECONDS, "NX")
      .exec();

    if (typeof count === "number" && count > MAX_MESSAGES) {
      return { success: false, retryAfterSec: WINDOW_SECONDS };
    }
    return { success: true };
  } catch {
    // Redis exec failures degrade open — burst protection lost for
    // this request, but the user still gets through. Anthropic's own
    // per-key rate limit is the secondary safety net.
    return { success: true };
  }
}
