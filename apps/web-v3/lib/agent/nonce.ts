import "server-only";

import { randomBytes } from "node:crypto";
import { getReadyRedisClient } from "@/lib/ratelimit";

// Single-use challenge nonces for agent (keypair) auth — Agent ID Phase A.
// A keypair proves it owns its address by signing a server-issued nonce; the
// nonce is consumed atomically so a captured signature can't be replayed to
// mint a second key. Redis-backed (5-min TTL); if Redis is unconfigured,
// agent-auth fails CLOSED (issue/consume return null/false → the route 503s) —
// the opposite of the rate limiter's fail-open, because this is an auth gate.

const NONCE_TTL_SECONDS = 5 * 60;
const NONCE_PREFIX = "agent-nonce:";

/** Issue a single-use nonce bound to `address`. Returns null if Redis is down. */
export async function issueNonce(
  address: string
): Promise<{ nonce: string; expiresAt: number } | null> {
  const redis = await getReadyRedisClient();
  if (!redis) {
    return null;
  }
  const nonce = randomBytes(24).toString("base64url");
  await redis.set(`${NONCE_PREFIX}${nonce}`, address, {
    EX: NONCE_TTL_SECONDS,
  });
  return { nonce, expiresAt: Date.now() + NONCE_TTL_SECONDS * 1000 };
}

/**
 * Atomically consume a nonce. Returns true iff it existed AND was bound to
 * `address`. `GETDEL` makes consumption single-use + race-free (a concurrent
 * second consume gets null).
 */
export async function consumeNonce(
  nonce: string,
  address: string
): Promise<boolean> {
  const redis = await getReadyRedisClient();
  if (!redis) {
    return false;
  }
  const stored = await redis.getDel(`${NONCE_PREFIX}${nonce}`);
  return stored === address;
}
