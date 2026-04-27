import { describe, it, expect } from 'vitest';
import { buildDispatchIntents } from '../dispatch-intents';
import { classifyReadIntents } from '../intent-dispatcher';

// ---------------------------------------------------------------------------
// [v0.48] Tests for the simplified dispatch-intents helper.
//
// History:
//
//   - v1.4 — five tests covering merge ordering between
//     RESUMED_SESSION_INTENTS (synthetic pre-fetch) and classifier output.
//   - v0.48 — RESUMED_SESSION_INTENTS deleted (bug 3 fix). The helper
//     now only dedups the classifier output. Tests reduced to the cases
//     that survive the simplification:
//
//       1. Different-args intents on the same tool are NOT merged
//          (fingerprint-keyed dedup, not toolName-keyed).
//       2. Identical intents from a compound classifier rule produce
//          a single dispatch.
//       3. Empty input → empty list.
//       4. Pass-through preservation — order from the classifier is
//          preserved.
// ---------------------------------------------------------------------------

describe('[v0.48] buildDispatchIntents — classifier dedup only', () => {
  it('1) different-args same-tool intents are NOT merged — fingerprints differ', () => {
    const intents = buildDispatchIntents({
      classified: [
        { toolName: 'transaction_history', args: { limit: 1 }, label: 'last' },
        { toolName: 'transaction_history', args: { date: '2026-04-19' }, label: 'today' },
      ],
    });

    expect(intents).toHaveLength(2);
    expect(intents.map((i) => i.toolName)).toEqual([
      'transaction_history',
      'transaction_history',
    ]);
  });

  it('2) identical fingerprints collapse — first-pushed wins', () => {
    const intents = buildDispatchIntents({
      classified: [
        { toolName: 'balance_check', args: {}, label: 'first' },
        { toolName: 'balance_check', args: {}, label: 'second' },
      ],
    });

    expect(intents).toHaveLength(1);
    expect(intents[0].label).toBe('first');
  });

  it('3) empty input → empty output', () => {
    expect(buildDispatchIntents({ classified: [] })).toEqual([]);
  });

  it('4) preserves classifier order', () => {
    const intents = buildDispatchIntents({
      classified: [
        { toolName: 'health_check', args: {}, label: 'health' },
        { toolName: 'balance_check', args: {}, label: 'balance' },
        { toolName: 'savings_info', args: {}, label: 'savings' },
      ],
    });

    expect(intents.map((i) => i.toolName)).toEqual([
      'health_check',
      'balance_check',
      'savings_info',
    ]);
  });

  it('5) integration — classifier output for "what\'s my balance" produces exactly one balance_check', () => {
    /**
     * Regression: the v1.4 helper added an extra synthetic balance_check
     * via RESUMED_SESSION_INTENTS, and dedup made sure the user's
     * classified balance_check collapsed onto it. With v0.48 only the
     * classifier output remains, so a single balance_check still
     * lands — just from a different source.
     */
    const classified = classifyReadIntents("what's my balance?");
    const balanceClassified = classified.filter((i) => i.toolName === 'balance_check');
    expect(balanceClassified.length).toBeGreaterThanOrEqual(1);

    const intents = buildDispatchIntents({ classified });
    const balanceIntents = intents.filter((i) => i.toolName === 'balance_check');
    expect(balanceIntents).toHaveLength(1);
  });

  it('6) "hey what\'s up" produces no synthetic pre-fetch — only classifier', () => {
    /**
     * Spec scenario 2 from the v1.4 tests: a free-form resume message
     * shouldn't fire balance_check + savings_info. Pre-v0.48 it would
     * (synthetic intents fired unconditionally on returning sessions).
     * Post-v0.48 the classifier doesn't match this string, so the
     * dispatch list is empty — the LLM can still call tools itself if
     * it decides the user wants them.
     */
    const intents = buildDispatchIntents({
      classified: classifyReadIntents("hey what's up"),
    });

    expect(intents.filter((i) => i.toolName === 'balance_check')).toHaveLength(0);
    expect(intents.filter((i) => i.toolName === 'savings_info')).toHaveLength(0);
  });
});
