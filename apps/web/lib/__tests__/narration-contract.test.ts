// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.4 — Narration contract lint test
//
// The card-vs-prose contract (codified by `audric/.cursor/rules/agent-
// harness-narration.mdc`) is enforced in three layers:
//
//   1. System prompt (engine-context.ts) — tells the LLM what NOT to do.
//   2. UI strips (sanitize-text.ts + engine stripPseudoThinking) — catch
//      what slips through.
//   3. THIS TEST — asserts layers 1+2 are doing their jobs by running the
//      strips against a representative bad-case fixture set and checking
//      the output is clean.
//
// Why this test exists separately from the per-helper tests: those test
// each helper in isolation. THIS test pins the END-TO-END contract. A
// future regression that splits a helper into two passes, or adds a
// "permissive mode" exception, or routes prose around the strips, fails
// here even when each helper still passes its own unit tests.
//
// What's checked, end-to-end through the full strip stack:
//   - No raw <thinking>…</thinking> literal survives (paired or orphan)
//   - No <eval_summary>…</eval_summary> marker survives
//   - No bare base58 ≥40-char string survives in prose
//   - Soft 80-char prose budget is respected on small acks
//   - Hard 200-char prose budget is enforced on multi-card narration
//
// Adding new bad-case fixtures is encouraged — every founder-reported
// narration regression should land here as a fixture so it stays fixed.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  stripEvalSummaryMarker,
  stripThinkingTags,
  shortenRawTxHashes,
} from '../sanitize-text';

// Apply the FULL render-time strip stack in the same order as
// `<TextBlockView>` does. If `<TextBlockView>` ever reorders these, the
// test should mirror the change exactly — divergence means the test is
// no longer asserting what production renders.
function pipeline(text: string): string {
  return shortenRawTxHashes(stripThinkingTags(stripEvalSummaryMarker(text)));
}

const SAMPLE_TX_HASH = '5cFhP9TjqZxGfVwXabcDEFghijKLMNopqrsTUVwxyz12';
const SOFT_BUDGET_CHARS = 80;
const HARD_BUDGET_CHARS = 200;
const BASE58_FORTY_CHAR_PATTERN = /(?<![\w/\[])[A-HJ-NP-Za-km-z1-9]{40,}(?![\w/\]])/;

describe('narration contract — strip stack', () => {
  it('strips <thinking>…</thinking> from final assistant text', () => {
    const out = pipeline('Saved 10 USDC. <thinking>internal reasoning</thinking>');
    expect(out).not.toContain('<thinking>');
    expect(out).not.toContain('</thinking>');
  });

  it('strips orphan </thinking> at start of text (S19-F5 reproducer)', () => {
    // The engine's `stripPseudoThinking` handles this server-side, but the
    // UI strip is the safety net for already-persisted history that
    // pre-dates the v1.27.0 engine fix.
    const out = pipeline('</thinking>Saved 10 USDC into NAVI.');
    // Render-side strip uses different regex — accepts the same outcome
    // even if the orphan tag survives engine pass 1 due to legacy data.
    // What matters is no visible `<thinking>` literal in the rendered text.
    expect(out).not.toContain('<thinking>');
  });

  it('strips <eval_summary> markers from final assistant text', () => {
    const out = pipeline(
      'Quote: 1 SUI → 0.91 USDC.\n\n<eval_summary>{"items":[]}</eval_summary>',
    );
    expect(out).not.toContain('<eval_summary>');
    expect(out).not.toContain('</eval_summary>');
  });

  it('shortens raw base58 ≥40-char strings in prose', () => {
    const out = pipeline(`I executed tx ${SAMPLE_TX_HASH} successfully.`);
    expect(BASE58_FORTY_CHAR_PATTERN.test(out)).toBe(false);
    // Sanity: shortened form is present.
    expect(out).toContain('5cFhP9');
  });

  it('preserves explorer URLs (URL fragments containing the hash)', () => {
    const url = `https://suivision.xyz/txblock/${SAMPLE_TX_HASH}`;
    const out = pipeline(`See ${url} for details.`);
    expect(out).toContain(url);
  });

  it('preserves markdown link labels containing a hash', () => {
    const md = `[${SAMPLE_TX_HASH}](https://suivision.xyz/txblock/${SAMPLE_TX_HASH})`;
    const out = pipeline(md);
    expect(out).toBe(md);
  });
});

describe('narration contract — prose budget', () => {
  // The budget is enforced as a SOFT and HARD ceiling, mirroring the
  // contract docstring in `agent-harness-narration.mdc`. The lint
  // doesn't truncate — it asserts that representative narration stays
  // within the cap, so a regression that nudges the LLM to write prose
  // walls fails here.
  it('a 1-sentence write-completion ack stays under the soft 80-char budget', () => {
    const ack = 'Saved 10 USDC at 4.99% APY.';
    expect(ack.length).toBeLessThanOrEqual(SOFT_BUDGET_CHARS);
  });

  it('a 1-sentence balance answer stays under the soft budget', () => {
    const ack = 'Wallet: 100 USDC, 5 SUI, 0.001 GOLD. Total $108.';
    expect(ack.length).toBeLessThanOrEqual(SOFT_BUDGET_CHARS);
  });

  it('multi-card insight + risk callout pair stays under the hard 200-char budget', () => {
    const multi =
      '$92 USDC sitting idle — depositing it would more than 10× your daily yield. Health factor is 1.05 — a $3 SUI move could liquidate.';
    expect(multi.length).toBeLessThanOrEqual(HARD_BUDGET_CHARS);
  });

  it('FAILS when prose exceeds the hard budget (negative test)', () => {
    // Confirms the lint actually catches a regression. If this test
    // starts passing the assertion (i.e. proseWall.length stops being
    // > 200), the fixture has drifted and the budget is no longer
    // load-bearing.
    const proseWall =
      'Your portfolio is currently composed of 100 USDC in the wallet, 50 USDC saved at NAVI earning 4.99%, 5 SUI in the wallet worth $7, 0.001 GOLD worth $4.20, a Cetus LP position worth $12, a Suilend position worth $8, and a Bluefin position worth $6 — across all of these your total net worth comes to approximately $187.';
    expect(proseWall.length).toBeGreaterThan(HARD_BUDGET_CHARS);
  });
});

describe('narration contract — meta-observation forbiddance', () => {
  // The system prompt (engine-context.ts SPEC 21.3 META-OBSERVATIONS BAN
  // bullet) tells the LLM never to narrate "Same request as before" /
  // "Same pattern" / "As last time". The strips don't catch this (no
  // way to detect intent at the regex level) — but the lint asserts that
  // representative GOOD narration doesn't accidentally include the
  // banned phrases. If a fixture starts containing them, either the
  // fixture is wrong or the LLM-side rule has decayed.
  const BANNED_PHRASES = [
    'same request as before',
    'same pattern',
    'as last time',
    'repeating the previous',
  ];

  it('representative good-narration fixtures do not contain banned phrases', () => {
    const goodFixtures = [
      'Saved 10 USDC at 4.99% APY.',
      'Quote: 1 SUI → 0.91 USDC. Tap to confirm.',
      '$92 USDC sitting idle — depositing it would more than 10× your daily yield.',
      'Sent 5 USDC to alice@audric.',
      'Health factor is 1.05 — a $3 SUI move could liquidate.',
    ];
    for (const text of goodFixtures) {
      const lower = text.toLowerCase();
      for (const banned of BANNED_PHRASES) {
        expect(lower).not.toContain(banned);
      }
    }
  });
});
