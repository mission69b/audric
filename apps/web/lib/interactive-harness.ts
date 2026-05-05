// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — Interactive Harness flag helper
//
// Single source of truth for the NEXT_PUBLIC_INTERACTIVE_HARNESS flag.
// Returns true when the env var is set to "1" or "true" (case-insensitive),
// false otherwise.
//
// Per-session pinning (B3.3 / spec G4) works as follows:
//   1. The chat route evaluates `isInteractiveHarnessEnabled()` ONCE per
//      session (at session creation, OR on the first turn of a pre-B3.3
//      session that hasn't been pinned yet).
//   2. The decision is persisted as `session.metadata.harnessVersion`
//      ('v2' = interactive timeline, 'legacy' = pre-B2 renderer).
//   3. Subsequent turns read the pinned value instead of the env var, so
//      a flag flip mid-rollout (10% → 50% → 100%) NEVER changes the
//      rendering of an in-flight session.
//   4. The pinned value flows to the client via the `session` SSE event
//      and the `/api/engine/sessions/[id]` GET response.
//
// Default OFF means new code paths are dormant in production until the
// founder explicitly flips the Vercel env var.
// ───────────────────────────────────────────────────────────────────────────

import { env } from './env';

/**
 * The stable harness identity for a single session.
 *  - `'v2'`     — the new chronological `ReasoningTimeline` renderer
 *  - `'legacy'` — today's "tools section first → reasoning accordion →
 *                 text last" layout (`<LegacyReasoningRender>`)
 */
export type HarnessVersion = 'v2' | 'legacy';

/**
 * True when the new ReasoningTimeline UX is enabled at the env-var level.
 *
 * Reads the typed `env.NEXT_PUBLIC_INTERACTIVE_HARNESS` (string |
 * undefined). Returns false on undefined, empty string, or any value
 * other than "1" / "true".
 *
 * ⚠ For per-session correctness, prefer the pinned `harnessVersion`
 * stamped on the session by the chat route — read this raw flag ONLY
 * when there's no session to pin against (the unauth/demo path or the
 * very first new-session decision).
 */
export function isInteractiveHarnessEnabled(): boolean {
  const v = env.NEXT_PUBLIC_INTERACTIVE_HARNESS;
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * [SPEC 8 v0.5.1 B3.7] Parsed `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT`,
 * clamped to `[0, 100]`. Returns `null` when the env var is undefined,
 * empty, or non-integer — caller treats null as "no percentage gate;
 * flag-on means admit every bucket" (today's behavior).
 *
 * Strict integer-only parse (audit polish): "50abc", "10.7", "5e2" all
 * return `null` instead of silently parsing as 50/10/5. The dial is a
 * whole-number percentage and a typo should fail loud (the founder
 * notices the rollout didn't move) rather than silently parse the
 * leading digits.
 *
 * Exported for tests; production callers should go through
 * `currentHarnessVersion(bucketKey)`.
 */
export function rolloutPercent(): number | null {
  const raw = env.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return 0;
  if (parsed >= 100) return 100;
  return parsed;
}

/**
 * [SPEC 8 v0.5.1 B3.7] Stable 32-bit FNV-1a hash of an arbitrary string,
 * modulo 100. Used to deterministically bucket users into the rollout
 * cohort: a single user always lands in the same `0..99` slot so they
 * don't flip between v2 and legacy across sessions while the rollout
 * dial is mid-flight.
 *
 * FNV-1a is chosen for: (a) zero-dep — doesn't need WebCrypto on the
 * server-side path, (b) deterministic across host restarts, (c)
 * uniform enough for a 100-bucket cohort split (we don't need
 * cryptographic strength — adversarial bucket gaming isn't a threat
 * model for a UX-shape rollout).
 *
 * Exported for tests; production callers should go through
 * `currentHarnessVersion(bucketKey)`.
 */
export function bucketFor(input: string): number {
  // FNV offset basis + prime (32-bit). All ops use `>>> 0` to stay in
  // unsigned 32-bit; JS bitwise ops are signed otherwise.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

/**
 * The version label that corresponds to the current env-var state.
 *
 * **Without** a `bucketKey` (legacy callers, unauth/demo sessions): pure
 * env-var check — flag-on means v2.
 *
 * **With** a `bucketKey` (typically the user's Sui address; sessionId
 * for unauth sessions): when both `NEXT_PUBLIC_INTERACTIVE_HARNESS=1`
 * AND `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` is set, only
 * admits buckets in the lower `rolloutPercent()` slice. A bucketKey
 * that lands in slots 0..(percent-1) gets v2; everything else stays
 * legacy. With percent=100 (or undefined) every bucket is admitted —
 * matches the no-bucket call signature.
 *
 * Used at session-creation time to stamp `session.metadata.harnessVersion`.
 * The pinned value (B3.3) still wins on subsequent turns of the same
 * session, so a dial-back from 50%→10% does NOT regress in-flight v2
 * sessions to legacy.
 */
export function currentHarnessVersion(bucketKey?: string): HarnessVersion {
  if (!isInteractiveHarnessEnabled()) return 'legacy';
  const percent = rolloutPercent();
  // No percent gate → flag-on means admit every session (legacy
  // behavior; preserved for tests that don't pass a bucketKey).
  if (percent === null || percent >= 100) return 'v2';
  if (percent <= 0) return 'legacy';
  // Percent gate active but caller can't bucket (no auth, no session
  // id). Conservative default: leave on legacy. A lone test-route
  // call without a key during 10% rollout shouldn't randomly admit.
  if (!bucketKey) return 'legacy';
  return bucketFor(bucketKey) < percent ? 'v2' : 'legacy';
}

/**
 * Narrowing guard for values we read out of `session.metadata` (typed as
 * `Record<string, unknown>` upstream). Anything that's not exactly `'v2'`
 * or `'legacy'` falls back to the caller's default — never coerce silently.
 */
export function asHarnessVersion(v: unknown): HarnessVersion | undefined {
  return v === 'v2' || v === 'legacy' ? v : undefined;
}

/**
 * [SPEC 9 v0.1.3 P9.6] True when the SPEC 9 v0.1.1 rollout flag is on
 * — controls whether the `add_recipient` tool joins the engine roster
 * AND whether `<OpenGoalsSidebar>` mounts in the dashboard. The
 * `<proactive>` marker rendering and `pending_input` event handling
 * are always-on (flag-off doesn't break stale browser tabs).
 *
 * Reads `env.NEXT_PUBLIC_HARNESS_V9` (string | undefined). Returns
 * false on undefined, empty string, or any value other than "1" /
 * "true" (case-insensitive).
 *
 * Unlike `isInteractiveHarnessEnabled()` there is no per-session
 * pinning here — the gated affordances are entirely additive (no
 * in-flight session can break when the dial moves), so a global
 * env-var read is sufficient.
 */
export function isHarnessV9Enabled(): boolean {
  const v = env.NEXT_PUBLIC_HARNESS_V9;
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}
