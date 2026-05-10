// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.3 — thinking-similarity unit tests
//
// Pinned cases:
//   - Verbatim repeat collapses (Jaccard 1.0).
//   - Light rephrase below threshold does NOT collapse.
//   - Carve-outs: first turn, error recovery, ambiguous input, multi-step
//     planning (≥3 enumerated steps) — all skip collapse even on high
//     Jaccard.
//   - Prefix-aware guard: high Jaccard with different first-3 tokens does
//     NOT collapse ("Evaluating route again" vs "Evaluating route").
//   - Tunable threshold via options param.
//   - Empty / very-short text never collapses.
//   - similarTurnIndex returns 1-based index of the matched prior.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeThinkingCollapse } from '../thinking-similarity';

describe('computeThinkingCollapse — base similarity', () => {
  it('collapses on verbatim repeat (Jaccard ≈ 1.0)', () => {
    const text = 'evaluating the swap route from USDC to SUI';
    const r = computeThinkingCollapse(text, [text]);
    expect(r.collapse).toBe(true);
    expect(r.similarTurnIndex).toBe(1);
  });

  it('does NOT collapse when prior text is unrelated (low Jaccard)', () => {
    const r = computeThinkingCollapse(
      'evaluating the swap route from USDC to SUI',
      ['checking the user health factor before borrowing'],
    );
    expect(r.collapse).toBe(false);
  });

  it('does NOT collapse on a light rephrase that drops below 0.7', () => {
    // Same intent, different words — under threshold. Picked to keep
    // overlap below 0.7 against the default token-set comparison.
    const r = computeThinkingCollapse(
      'evaluating the swap route from USDC to SUI for the user',
      ['user is asking me to swap one currency into another currency'],
    );
    expect(r.collapse).toBe(false);
  });

  it('returns 1-based similarTurnIndex of matched prior', () => {
    const r = computeThinkingCollapse('saving USDC into navi pool now', [
      'completely different reasoning here unrelated topic',
      'saving USDC into navi pool now',
      'another unrelated thing about borrowing',
    ]);
    expect(r.collapse).toBe(true);
    expect(r.similarTurnIndex).toBe(2);
  });
});

describe('computeThinkingCollapse — carve-outs', () => {
  const dup = 'evaluating the swap route from USDC to SUI now';

  it('first turn of session always renders fully', () => {
    const r = computeThinkingCollapse(dup, [dup], { isFirstTurn: true });
    expect(r.collapse).toBe(false);
  });

  it('error recovery always renders fully (post-error narration is signal)', () => {
    const r = computeThinkingCollapse(dup, [dup], { isErrorRecovery: true });
    expect(r.collapse).toBe(false);
  });

  it('ambiguous input always renders fully (clarification trail is signal)', () => {
    const r = computeThinkingCollapse(dup, [dup], { isAmbiguousInput: true });
    expect(r.collapse).toBe(false);
  });

  it('multi-step plan with ≥3 enumerated steps does NOT collapse', () => {
    const plan =
      'I will execute the bundle in three steps. 1. swap USDC to SUI. 2. send SUI. 3. record advice.';
    const r = computeThinkingCollapse(plan, [plan]);
    expect(r.collapse).toBe(false);
  });
});

describe('computeThinkingCollapse — prefix-aware guard', () => {
  it('does NOT collapse when first 3 tokens differ even on high Jaccard', () => {
    // High lexical overlap; first three normalized tokens differ
    // ("evaluating route again" vs "evaluating route because"), so the
    // prefix guard fires and we render fully — distinct intent.
    const a = 'evaluating route again because the prior quote expired and slippage';
    const b = 'evaluating route because the prior quote expired and slippage exceeded';
    const r = computeThinkingCollapse(a, [b]);
    expect(r.collapse).toBe(false);
  });

  it('collapses when first 3 tokens match AND Jaccard above threshold', () => {
    const a = 'evaluating the swap route again because nothing changed since last quote';
    const b = 'evaluating the swap route again because nothing changed since last quote';
    const r = computeThinkingCollapse(a, [b]);
    expect(r.collapse).toBe(true);
  });
});

describe('computeThinkingCollapse — threshold + edge cases', () => {
  it('respects a tunable threshold (lower threshold collapses more)', () => {
    const a = 'evaluating swap route USDC SUI now';
    const b = 'evaluating swap route different intent here';
    const high = computeThinkingCollapse(a, [b], { threshold: 0.9 });
    const low = computeThinkingCollapse(a, [b], { threshold: 0.2 });
    expect(high.collapse).toBe(false);
    expect(low.collapse).toBe(true);
  });

  it('does NOT collapse when current text is too short', () => {
    const r = computeThinkingCollapse('go', ['go']);
    expect(r.collapse).toBe(false);
  });

  it('skips prior entries that are too short to compare', () => {
    const r = computeThinkingCollapse('evaluating the route from USDC to SUI', ['x', 'y']);
    expect(r.collapse).toBe(false);
  });

  it('handles an empty priorThinkingTexts array', () => {
    const r = computeThinkingCollapse('evaluating the route', []);
    expect(r.collapse).toBe(false);
  });
});
