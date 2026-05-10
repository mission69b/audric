// ───────────────────────────────────────────────────────────────────────────
// SPEC 23A-P0 (2026-05-11) — Legacy harness rip
//
// The interactive harness ("v2") replaced the pre-B2 "tools section first
// → reasoning accordion → final text" renderer. Rolled to 100% via SPEC 8
// v0.5.1 B3.7's `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` dial,
// then verified clean via the 2026-05-11 Upstash audit (0 sessions still
// pinned to legacy in last 7d). The `LegacyReasoningRender` component +
// the rollout-percent infra (`rolloutPercent`, `bucketFor`,
// `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT`) were ripped here.
//
// What's kept (one-release-cycle deprecation surface):
//   - `HarnessVersion` type — still on `<ChatMessage>` props + the
//     `useEngine` state shape + the `/api/engine/sessions/[id]` GET
//     response. Removing it would touch 6 more files for zero net win.
//   - `currentHarnessVersion(_bucketKey?)` stub returning `'v2'` — call
//     sites in `chat/route.ts` keep working without modification.
//   - `asHarnessVersion()` narrowing guard — used by the SSE/GET
//     deserialisation and by the defensive auto-flip guard in
//     `chat/route.ts` that flips any stale legacy-pin to v2.
//   - `isInteractiveHarnessEnabled()` — symbolic kill-switch reserved
//     for one cycle. Not consulted by any rendering path post-rip; if
//     v2 ships a regression, redeploying a prior commit is the real
//     escape hatch. Function stays so we can wire it up if needed.
//   - `isHarnessV9Enabled()` — unrelated SPEC 9 v0.1.1 feature flag,
//     orthogonal to this rip. Untouched.
//
// Next minor: delete the stubs + `HarnessVersion` type + the
// `pinnedHarnessVersion` prop chain. Track via SPEC 23 §1 P0 step 3.
// ───────────────────────────────────────────────────────────────────────────

import { env } from './env';

/**
 * The stable harness identity for a session.
 *
 * Post-SPEC-23A-P0 only `'v2'` is reachable in production — the
 * `'legacy'` branch was deleted. The literal stays in the union for
 * one release cycle so any pre-rip persisted session metadata that
 * still carries `'legacy'` deserialises cleanly through `asHarnessVersion`
 * (the auto-flip guard then forces it back to `'v2'` at the read site).
 */
export type HarnessVersion = 'v2' | 'legacy';

/**
 * Reads `NEXT_PUBLIC_INTERACTIVE_HARNESS`. Returns true for "1" / "true"
 * (case-insensitive), false otherwise.
 *
 * **Reserved kill-switch.** Not consulted by any rendering path
 * post-SPEC-23A-P0. Kept for one release cycle so we can wire it back
 * up if a v2 regression needs an emergency override. Real escape hatch
 * for incidents is "redeploy the previous commit".
 */
export function isInteractiveHarnessEnabled(): boolean {
  const v = env.NEXT_PUBLIC_INTERACTIVE_HARNESS;
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * Stub returning `'v2'` unconditionally.
 *
 * Pre-rip this evaluated env-var + bucketed user address against the
 * `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` dial to admit a
 * lower percentage of users to v2. Post-rip every session is v2.
 *
 * The `_bucketKey` parameter is preserved (prefixed `_` to indicate
 * unused) so call sites in `chat/route.ts` don't need to change. The
 * stub + parameter both delete in the next minor.
 */
export function currentHarnessVersion(_bucketKey?: string): HarnessVersion {
  return 'v2';
}

/**
 * Narrowing guard for values read out of `session.metadata` (typed as
 * `Record<string, unknown>` upstream). Returns `'v2'` or `'legacy'`
 * when the input matches exactly, otherwise `undefined`.
 *
 * Callers that want "v2 with auto-flip on stale legacy pins" should
 * use the inline guard from `chat/route.ts` / `sessions/[id]/route.ts`
 * instead — this function intentionally does NOT auto-flip so unit
 * tests of the rip behaviour stay precise.
 */
export function asHarnessVersion(v: unknown): HarnessVersion | undefined {
  return v === 'v2' || v === 'legacy' ? v : undefined;
}

/**
 * [SPEC 9 v0.1.3 P9.6] True when the SPEC 9 v0.1.1 rollout flag is on
 * — controls whether the `add_recipient` tool joins the engine roster.
 * Orthogonal to the SPEC 23A-P0 rip; left untouched.
 *
 * NOTE: P9.3 persistent cross-turn todos was REMOVED on 2026-05-05 (see
 * audric-build-tracker.md S.64). The flag now gates only the P9.4
 * `add_recipient` opt-in tool.
 */
export function isHarnessV9Enabled(): boolean {
  const v = env.NEXT_PUBLIC_HARNESS_V9;
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}
