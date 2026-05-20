/**
 * Account-age gate (SPEC 30 D-13 lock — 2026-05-14).
 *
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY A.5 / S.198 — 2026-05-20]
 * Mirrored byte-for-byte from `apps/web/lib/engine/account-age-gate.ts`
 * because the legacy module's docstring (line 26-28) explicitly OKs the
 * copy: "When a second host (CLI/MCP) needs the same gate it can copy
 * this 30-line module. Promote to the engine package only when 2+ hosts
 * actually need it (per `engineering-principles.mdc` — factor when LOGIC
 * duplicates, not when SHAPE does)." Web-v2 is the second host. Once
 * v0.7c Phase 6 cuts audric/web over to web-v2, the source module
 * deletes and this one stays as the canonical.
 *
 * Closes the takeover-while-onboarding window: an attacker who
 * compromises a Day-1 zkLogin account (e.g. via Google session cookie
 * theft) cannot silently drain it via small-USD auto-tier writes
 * during the first 7 days. Every write — no matter how small —
 * requires explicit tap-to-confirm until the account turns 7 days old.
 *
 * Mechanism: at the boundary where `UserPermissionConfig` is read
 * (here, in `/api/chat`), the config is passed through
 * `applyAccountAgeGate(config, ageDays)`. When `ageDays < 7`, the gate
 * clones the config with every `autoBelow` (per-rule + global) zeroed
 * → `resolvePermissionTier` returns `confirm` for any positive USD
 * amount → no auto-execute path can fire.
 *
 * Pairs with D-8 bounded-blast-radius for prompt-injection defense
 * in depth: even if injected memory tricks the LLM into issuing a
 * write, the user sees a confirm card.
 *
 * Pre-existing users (created >7d ago): no behaviour change. Their
 * `accountAgeDays >= 7` → gate is open, config flows through
 * untouched.
 */

import type { UserPermissionConfig } from "@t2000/engine";

export const ACCOUNT_AGE_GATE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/**
 * Returns the number of days since `createdAt`. Uses 86_400_000ms per
 * day (clock-time, not calendar-day). 7-day gate is a security
 * threshold, not a calendar concept — DST / timezone don't apply.
 *
 * Rounds DOWN (floor). A user created exactly 6.99 days ago is still
 * "Day 6" for the purposes of the gate.
 */
export function computeAccountAgeDays(
  createdAt: Date | string | null | undefined
): number | null {
  if (!createdAt) {
    return null;
  }
  const t =
    typeof createdAt === "string"
      ? new Date(createdAt).getTime()
      : createdAt.getTime();
  if (Number.isNaN(t)) {
    return null;
  }
  return Math.floor((Date.now() - t) / MS_PER_DAY);
}

/**
 * Apply the ≥7d account-age gate to a permission config.
 *
 * - `accountAgeDays === null` → fail OPEN (legacy / unknown — no gate).
 *   Pre-existing users without a `createdAt` query in the call path
 *   should NOT regress. The gate is opt-in via the caller passing a
 *   real number.
 * - `accountAgeDays >= 7` → no transformation; original config returned.
 * - `accountAgeDays < 7` → clone config with `globalAutoBelow: 0` AND
 *   every per-rule `autoBelow: 0`. `confirmBetween` left unchanged so
 *   high-USD writes still hit the `explicit` tier (manual init only).
 *   `autonomousDailyLimit` left unchanged — irrelevant when nothing
 *   resolves to `auto` anyway.
 *
 * Returns a NEW config object; never mutates the input.
 */
export function applyAccountAgeGate(
  config: UserPermissionConfig,
  accountAgeDays: number | null
): UserPermissionConfig {
  if (accountAgeDays === null) {
    return config;
  }
  if (accountAgeDays >= ACCOUNT_AGE_GATE_DAYS) {
    return config;
  }
  return {
    ...config,
    globalAutoBelow: 0,
    rules: config.rules.map((r) => ({ ...r, autoBelow: 0 })),
  };
}
