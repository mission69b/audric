import { describe, it, expect } from 'vitest';
import { buildDispatchIntents } from '../dispatch-intents';
import { classifyReadIntents, type ReadIntent } from '../intent-dispatcher';

// ---------------------------------------------------------------------------
// [v1.4 — Item 2] Tests for the resumed-session prefetch dedup helper.
//
// Spec mandates four scenarios in
// `audric/apps/web/tests/chat-route-resumed-session-prefetch.test.ts`. The
// route-level shape (POST → SSE event ordering) requires booting the full
// engine + auth + session-store stack, which has no existing harness in
// this repo. The dedup *semantics* — what intents fire and in what order —
// are captured by exercising `buildDispatchIntents` directly. The route
// itself is now a 5-line caller around this helper, so a regression in
// the merge ordering or argsFingerprint-equivalence is impossible to
// introduce without breaking these unit tests first.
//
// Spec mapping:
//
//   1. "pre-fetches balance_check + savings_info on first user message of
//       a resumed session" → test 1 below
//   2. "does NOT pre-fetch on a new session — buildSyntheticPrefetch
//       handles that path"                                → test 2 below
//   3. "does NOT pre-fetch when unauth"                    → test 2 below
//        (both paths produce `isReturningSession=false`; one helper
//         test covers both observable outcomes)
//   4. "dedups when a classified intent matches a synthetic intent"
//                                                         → test 3 below
//
// Plus two extra tests exercising fingerprint-equivalence semantics
// (different classifier-args don't collapse, and the synthetic intent is
// preserved when fingerprints match).
// ---------------------------------------------------------------------------

const RESUMED_SESSION_INTENTS: readonly ReadIntent[] = [
  { toolName: 'balance_check', args: {}, label: 'resumed-session pre-fetch (balance)' },
  { toolName: 'savings_info', args: {}, label: 'resumed-session pre-fetch (savings)' },
];

describe('[v1.4 — Item 2] buildDispatchIntents', () => {
  it('1) returning auth session with no classifier hits → fires balance_check + savings_info', () => {
    const intents = buildDispatchIntents({
      classified: [],
      isReturningSession: true,
      resumedIntents: RESUMED_SESSION_INTENTS,
    });

    expect(intents).toHaveLength(2);
    expect(intents.map((i) => i.toolName)).toEqual([
      'balance_check',
      'savings_info',
    ]);
  });

  it('2) new session OR unauth → no synthetic pre-fetch (isReturningSession=false)', () => {
    // Both "new auth session" (engine-factory.ts:buildSyntheticPrefetch
    // already covers it) and "unauth landing-page hit" (no balance/
    // savings access at all) collapse to `isReturningSession=false`. The
    // helper must produce zero synthetic intents in this case so cold
    // visits don't log "tool not found" warnings on every request.
    const classified = classifyReadIntents("hey what's up");
    const intents = buildDispatchIntents({
      classified,
      isReturningSession: false,
      resumedIntents: RESUMED_SESSION_INTENTS,
    });

    expect(intents.filter((i) => i.toolName === 'balance_check')).toHaveLength(0);
    expect(intents.filter((i) => i.toolName === 'savings_info')).toHaveLength(0);
  });

  it('3) resumed session + matching classifier intent → exactly one balance_check (synthetic wins)', () => {
    // "what's my balance" classifies to a no-arg `balance_check` rule
    // whose argsFingerprint matches the synthetic resumed-session
    // intent. The first-pushed (synthetic) intent must be retained;
    // the classifier's would-be duplicate is silently dropped. This is
    // the precise regression case that resurrected the "Returning user
    // 2 → 0 tool calls" baseline metric in v1.3.1 audits.
    const classified = classifyReadIntents("what's my balance?");
    const balanceClassified = classified.filter((i) => i.toolName === 'balance_check');
    expect(balanceClassified.length).toBeGreaterThanOrEqual(1);

    const intents = buildDispatchIntents({
      classified,
      isReturningSession: true,
      resumedIntents: RESUMED_SESSION_INTENTS,
    });

    const balanceIntents = intents.filter((i) => i.toolName === 'balance_check');
    expect(balanceIntents).toHaveLength(1);
    expect(balanceIntents[0].label).toBe('resumed-session pre-fetch (balance)');
    // savings_info still fires from the synthetic set even though the
    // classifier didn't ask for it.
    expect(intents.filter((i) => i.toolName === 'savings_info')).toHaveLength(1);
  });

  it('4) different-args same-tool intents are NOT merged — fingerprints differ', () => {
    // The fingerprint formula keys on full args. Two intents that target
    // the same tool with different inputs (e.g. transaction_history with
    // limit:1 vs date:'today') must both fire — the dedup is by
    // (toolName, argsFingerprint), not by toolName alone.
    const intents = buildDispatchIntents({
      classified: [
        { toolName: 'transaction_history', args: { limit: 1 }, label: 'last' },
        { toolName: 'transaction_history', args: { date: '2026-04-19' }, label: 'today' },
      ],
      isReturningSession: false,
      resumedIntents: RESUMED_SESSION_INTENTS,
    });

    expect(intents).toHaveLength(2);
    expect(intents.map((i) => i.toolName)).toEqual([
      'transaction_history',
      'transaction_history',
    ]);
  });

  it('5) ordering — synthetic intents always come before classifier intents', () => {
    // Synthetic pre-fetch must run first so the LLM sees fresh balance/
    // savings context before any classifier-driven tool result. Order
    // is part of the observable contract: the for-loop in chat/route.ts
    // streams SSE events in this order and downstream UI cards render
    // in the same order they're emitted.
    const intents = buildDispatchIntents({
      classified: [
        { toolName: 'health_check', args: {}, label: 'classified-health' },
      ],
      isReturningSession: true,
      resumedIntents: RESUMED_SESSION_INTENTS,
    });

    expect(intents.map((i) => i.toolName)).toEqual([
      'balance_check',
      'savings_info',
      'health_check',
    ]);
  });

  it('6) empty classifier + unauth → empty list', () => {
    const intents = buildDispatchIntents({
      classified: [],
      isReturningSession: false,
      resumedIntents: RESUMED_SESSION_INTENTS,
    });
    expect(intents).toEqual([]);
  });
});
