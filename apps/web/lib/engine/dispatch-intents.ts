// ---------------------------------------------------------------------------
// [v1.4 — Item 2] Pure helper that builds the ordered, deduplicated list of
// read intents the chat route will pre-dispatch before the LLM agent loop
// runs. Pulled out of `chat/route.ts` purely for testability — the route
// itself just calls `buildDispatchIntents()` and feeds the result into the
// existing for-loop that calls `engine.invokeReadTool()`.
//
// The merge order is intentional:
//
//   1. RESUMED_SESSION_INTENTS (only when `isReturningSession === true`)
//   2. classifyReadIntents() output (always)
//
// Dedup uses the canonical `argsFingerprint()` formula from
// `intent-dispatcher.ts` so a classifier rule that produces an intent
// fingerprint-equal to a synthetic resumed-session intent (e.g. user types
// "what's my balance" while reopening a session) collapses to ONE
// `balance_check` dispatch — the synthetic one wins because it was added
// first. The classifier's would-be duplicate is silently dropped.
//
// The flat-list shape (`ReadIntent[]`) and the ordering guarantee are the
// observable contract the route depends on. Tests in
// `__tests__/dispatch-intents.test.ts` cover the four spec scenarios.
// ---------------------------------------------------------------------------

import { argsFingerprint, type ReadIntent } from './intent-dispatcher';

export interface DispatchIntentsInput {
  /** Output of `classifyReadIntents(message)` — never null. */
  classified: readonly ReadIntent[];
  /**
   * Whether the user is reopening an existing auth session. Only `true`
   * triggers the resumed-session pre-fetch — new sessions are covered by
   * `engine-factory.ts:buildSyntheticPrefetch`, unauth visits don't have
   * access to balance/savings tools.
   */
  isReturningSession: boolean;
  /**
   * Synthetic intents to prepend on a returning-session turn. Passed in
   * (instead of imported as a module constant) so tests can vary the set
   * without monkey-patching.
   */
  resumedIntents: readonly ReadIntent[];
}

export function buildDispatchIntents(input: DispatchIntentsInput): ReadIntent[] {
  const seen = new Set<string>();
  const intents: ReadIntent[] = [];

  const pushUnique = (intent: ReadIntent): void => {
    const key = `${intent.toolName}:${argsFingerprint(intent.args)}`;
    if (seen.has(key)) return;
    seen.add(key);
    intents.push(intent);
  };

  if (input.isReturningSession) {
    for (const intent of input.resumedIntents) pushUnique(intent);
  }
  for (const intent of input.classified) pushUnique(intent);

  return intents;
}
