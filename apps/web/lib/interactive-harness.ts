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
 * The version label that corresponds to the current env-var state.
 * Used at session-creation time to stamp `session.metadata.harnessVersion`.
 */
export function currentHarnessVersion(): HarnessVersion {
  return isInteractiveHarnessEnabled() ? 'v2' : 'legacy';
}

/**
 * Narrowing guard for values we read out of `session.metadata` (typed as
 * `Record<string, unknown>` upstream). Anything that's not exactly `'v2'`
 * or `'legacy'` falls back to the caller's default — never coerce silently.
 */
export function asHarnessVersion(v: unknown): HarnessVersion | undefined {
  return v === 'v2' || v === 'legacy' ? v : undefined;
}
