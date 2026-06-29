import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { ChatbotError } from "@/lib/errors";

// THE live anonymous (not-signed-in) cap — anon has no user row, so it's gated
// here by IP, NOT by the per-user daily cap in the chat route. This is the wall
// that triggers the sign-in nudge, so it's the real conversion lever: a guest
// gets a small taste, then signing up unlocks the 20/day free tier. Hourly (not
// daily) on purpose — shared IPs (offices, mobile NAT) make a daily IP cap
// risky; the hourly reset is a safety valve against blocking innocent users.
const MAX_MESSAGES = 5;
const TTL_SECONDS = 60 * 60;

let client: ReturnType<typeof createClient> | null = null;
let connectPromise: Promise<unknown> | null = null;

function ensureClient() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => undefined);
    // Fire-and-forget connect; the promise is awaited by getReadyRedisClient.
    // The .catch resets the singleton so a failed connect can be retried.
    connectPromise = client.connect().catch(() => {
      client = null;
      connectPromise = null;
    });
  }
}

/** Sync accessor — may return a not-yet-ready client. Fine for the rate
 *  limiters (they fail OPEN on `!isReady`, so readiness is irrelevant). */
export function getRedisClient() {
  ensureClient();
  return client;
}

/**
 * Async accessor that AWAITS the connection. For fail-CLOSED callers (agent-
 * auth nonces) that must tell "Redis down" apart from "not connected yet" —
 * on a cold serverless invocation `connect()` is still in flight on the first
 * request, so the sync getter would (wrongly) look unavailable. Returns null
 * only when Redis is genuinely unconfigured/unreachable.
 */
export async function getReadyRedisClient() {
  ensureClient();
  if (!client) {
    return null;
  }
  if (client.isReady) {
    return client;
  }
  if (connectPromise) {
    await connectPromise;
  }
  return client?.isReady ? client : null;
}

// Per-API-key requests-per-minute cap for the Private API (/v1) — closes the
// v1 no-rate-limit gap so a leaked/runaway key can't hammer the API
// (SPEC_T2000_API_V2 M4.10). Fails OPEN: if Redis is down/unconfigured (e.g.
// local dev with no REDIS_URL), it never blocks legitimate traffic. Returns
// true = allowed, false = over the cap (the caller returns a 429).
const API_RPM = 120;
const API_RPM_TTL_SECONDS = 60;

export async function checkApiRateLimit(keyId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis?.isReady) {
    return true;
  }
  try {
    const key = `api-rpm:${keyId}`;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, API_RPM_TTL_SECONDS, "NX")
      .exec();
    return !(typeof count === "number" && count > API_RPM);
  } catch {
    return true;
  }
}

// Per-IP cap for the unauthenticated agent endpoints (/v1/agent/*). They're
// individually guarded (topup needs a real on-chain deposit, keys needs a
// valid signature + funded account + single-use nonce), but topup amplifies
// into GraphQL reads, so a per-IP cap blunts spam. Fails OPEN (Redis down /
// no IP → never block legit traffic).
const AGENT_IP_RPM = 30;

export async function checkAgentIpRateLimit(
  ip: string | undefined
): Promise<boolean> {
  if (!ip) {
    return true;
  }
  const redis = getRedisClient();
  if (!redis?.isReady) {
    return true;
  }
  try {
    const key = `agent-ip-rpm:${ip}`;
    const [count] = await redis.multi().incr(key).expire(key, 60, "NX").exec();
    return !(typeof count === "number" && count > AGENT_IP_RPM);
  } catch {
    return true;
  }
}

/** Best-effort client IP from the standard proxy headers (Vercel sets both). */
export function clientIp(request: Request): string | undefined {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    return fwd.split(",")[0]?.trim() || undefined;
  }
  return request.headers.get("x-real-ip") ?? undefined;
}

export async function checkIpRateLimit(ip: string | undefined) {
  if (!isProductionEnvironment || !ip) {
    return;
  }

  const redis = getRedisClient();
  if (!redis?.isReady) {
    return;
  }

  try {
    const key = `ip-rate-limit:${ip}`;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, TTL_SECONDS, "NX")
      .exec();

    if (typeof count === "number" && count > MAX_MESSAGES) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
  }
}
