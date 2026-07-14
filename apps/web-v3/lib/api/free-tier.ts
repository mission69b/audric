import "server-only";

import { env } from "@/lib/env";
import { getReadyRedisClient } from "@/lib/ratelimit";

/**
 * The FREE TIER (SPEC_INFERENCE_DEMAND Step-1 item 4) — a capped daily
 * ALLOWANCE, not a free model. `kimi-k2.7-code` stays fully metered in the
 * catalog; free-tier requests for it draw a per-ACCOUNT daily allowance
 * (micro-USD of notional debit) instead of the credit ledger.
 *
 * Design calls:
 * - Per-account, not per-key: every console account is Google sign-in
 *   (zkLogin), so the account IS the sybil gate — one account = one
 *   allowance; minting more keys mints nothing.
 * - Valid on the free-tier model ONLY, requested directly — no router ids,
 *   no frontier, no confidential.
 * - The allowance is a COST ENVELOPE dial, not a marketed token number:
 *   `FREE_TIER_DAILY_MICROS` env (micro-USD/day, e.g. 1000000 = $1.00).
 *   Unset/0 → the free tier is OFF (no behavior change anywhere).
 * - Fail CLOSED on Redis unavailability: no counter = no free ride (the
 *   paid path still works) — never serve uncounted free inference.
 * - Check-then-settle: the gate reads the counter before serving; the
 *   notional debit lands after the response. A burst can overshoot by at
 *   most one RPM-window of requests — bounded, accepted.
 */

export const FREE_TIER_MODEL = "moonshotai/kimi-k2.7-code";

/** Free rides get a stricter RPM than the per-key 120 (abuse bound — the
 * allowance itself is the real cap; this just flattens burst overshoot). */
const FREE_RPM = 20;

/** Counter TTL — 48h covers the UTC-day window plus clock skew. */
const DAY_TTL_SECONDS = 60 * 60 * 48;

export function freeTierDailyMicros(): number {
  const raw = env.FREE_TIER_DAILY_MICROS;
  if (!raw) {
    return 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function isFreeTierEnabled(): boolean {
  return freeTierDailyMicros() > 0;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayKey(userId: string): string {
  return `free-day:${userId}:${todayUtc()}`;
}

export type FreeAllowanceResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "unavailable" | "rpm" | "exhausted" };

/**
 * Gate a request onto the free allowance. `ok: false` never blocks the
 * request by itself — the caller falls through to the paid path (or 402s
 * when there is no credit either).
 */
export async function tryFreeAllowance(
  userId: string
): Promise<FreeAllowanceResult> {
  const daily = freeTierDailyMicros();
  if (daily <= 0) {
    return { ok: false, reason: "disabled" };
  }
  const redis = await getReadyRedisClient();
  if (!redis) {
    return { ok: false, reason: "unavailable" };
  }
  try {
    const rpmKey = `free-rpm:${userId}`;
    const [count] = await redis
      .multi()
      .incr(rpmKey)
      .expire(rpmKey, 60, "NX")
      .exec();
    if (typeof count === "number" && count > FREE_RPM) {
      return { ok: false, reason: "rpm" };
    }
    const spent = await redis.get(dayKey(userId));
    if (spent !== null && Number(spent) >= daily) {
      return { ok: false, reason: "exhausted" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Settle a served free ride: accrue its notional debit to today's counter. */
export async function recordFreeSpend(
  userId: string,
  micros: number
): Promise<void> {
  if (micros <= 0) {
    return;
  }
  const redis = await getReadyRedisClient();
  if (!redis) {
    return;
  }
  try {
    await redis
      .multi()
      .incrBy(dayKey(userId), micros)
      .expire(dayKey(userId), DAY_TTL_SECONDS, "NX")
      .exec();
  } catch {
    // Best-effort settle — the gate already bounded the day's exposure.
  }
}
