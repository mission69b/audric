/**
 * [v1.4.2 — Day 3 / Spec Item 3] Synthetic-session sessionId classifier.
 *
 * Both `app/api/engine/chat/route.ts` (Day 3) and
 * `app/api/engine/resume/route.ts` (Day 4 wires it through) MUST use
 * the same derivation when stamping `TurnMetrics.synthetic`. Otherwise
 * a turn's `initial` row and its matching `resume` row could disagree
 * on the bit and dashboards filtered with `WHERE synthetic = false`
 * would mis-pair them.
 *
 * Extracted as a module-level helper (rather than inline in each route)
 * so the parity comment in those routes is enforced by construction:
 * a single import means the two paths can never drift.
 *
 * Empty / unset env => returns `false` for every sessionId, which is
 * the conservative default before the test harness starts emitting a
 * stable prefix (the Day-3 follow-up documented in `.env.example`).
 */

/**
 * Parsed prefix list. Computed once at module load — the chat route hot
 * path runs hundreds of times per second on a warm Vercel function and
 * we don't want to re-split the env var on every turn.
 *
 * Exported for tests; production code should call `isSyntheticSessionId`.
 */
export const SYNTHETIC_SESSION_PREFIXES: readonly string[] = (
  process.env.SYNTHETIC_SESSION_PREFIXES ?? ''
)
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

/**
 * Returns `true` when `sessionId` starts with any prefix configured in
 * `SYNTHETIC_SESSION_PREFIXES`. Returns `false` for empty/unset env or
 * when no prefix matches.
 */
export function isSyntheticSessionId(sessionId: string): boolean {
  if (SYNTHETIC_SESSION_PREFIXES.length === 0) return false;
  return SYNTHETIC_SESSION_PREFIXES.some((p) => sessionId.startsWith(p));
}

/**
 * Test-only helper: re-derive the prefix list from the current
 * `process.env` (rather than the module-load-time snapshot). Used by
 * the synthetic-sessions test suite to verify env semantics without
 * forcing every consumer through a configurable factory.
 *
 * Production code MUST NOT call this — it would silently break the
 * "compute once at module load" invariant the cache-friendly default
 * relies on.
 */
export function __test_currentPrefixes(): readonly string[] {
  return (process.env.SYNTHETIC_SESSION_PREFIXES ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function __test_isSyntheticWithCurrentEnv(sessionId: string): boolean {
  const prefixes = __test_currentPrefixes();
  if (prefixes.length === 0) return false;
  return prefixes.some((p) => sessionId.startsWith(p));
}
