import { describe, it, expect } from 'vitest';
import { stripEvalSummaryMarker, stripThinkingTags } from '../sanitize-text';

describe('stripEvalSummaryMarker', () => {
  it('returns input unchanged when no marker is present', () => {
    expect(stripEvalSummaryMarker('Quote: 1 SUI → 0.91 USDC')).toBe(
      'Quote: 1 SUI → 0.91 USDC',
    );
  });

  it('returns empty string unchanged', () => {
    expect(stripEvalSummaryMarker('')).toBe('');
  });

  it('strips a complete marker with surrounding whitespace', () => {
    const input =
      'Quote: 1 SUI → 0.91 USDC. Executing now.\n\n<eval_summary>{"items":[{"label":"x","status":"good"}]}</eval_summary>';
    expect(stripEvalSummaryMarker(input)).toBe(
      'Quote: 1 SUI → 0.91 USDC. Executing now.',
    );
  });

  it('strips a marker in the middle of text', () => {
    const input =
      'Before. <eval_summary>{"items":[{"label":"x","status":"good"}]}</eval_summary> After.';
    expect(stripEvalSummaryMarker(input)).toBe('Before.After.');
  });

  it('strips multiple complete markers', () => {
    const input =
      'A.\n<eval_summary>{"items":[{"label":"x","status":"good"}]}</eval_summary>\nB.\n<eval_summary>{"items":[{"label":"y","status":"warning"}]}</eval_summary>\nC.';
    expect(stripEvalSummaryMarker(input)).toBe('A.B.C.');
  });

  it('truncates at an unclosed marker (streaming case)', () => {
    const input = 'Quote: 1 SUI → 0.91 USDC.\n\n<eval_summary>{"items":[{"label":"x"';
    expect(stripEvalSummaryMarker(input)).toBe('Quote: 1 SUI → 0.91 USDC.');
  });

  it('handles only the marker (entire text is the marker)', () => {
    const input = '<eval_summary>{"items":[{"label":"x","status":"good"}]}</eval_summary>';
    expect(stripEvalSummaryMarker(input)).toBe('');
  });

  it('preserves text without a marker at non-zero cost (early return path)', () => {
    const input = 'Long assistant text without any marker present here.';
    expect(stripEvalSummaryMarker(input)).toBe(input);
  });

  it('handles a complete marker followed by an unclosed one', () => {
    const input =
      'A.\n<eval_summary>{"items":[{"label":"x","status":"good"}]}</eval_summary>\nB.\n<eval_summary>{"items":[{"label":"y"';
    expect(stripEvalSummaryMarker(input)).toBe('A.B.');
  });

  it('the founder-repro 2026-05-01 trace renders cleanly', () => {
    const input =
      'Quote: 1 SUI → 0.913593 USDC (0.05% impact via Bluefin). Executing now.\n\n<eval_summary>{"items": [{"label": "Wallet SUI", "status": "good", "note": "5.55 SUI available, swapping 1"}, {"label": "Output", "status": "good", "note": "0.9136 USDC"}, {"label": "Price impact", "status": "good", "note": "~0.05% via Bluefin"}]}</eval_summary>';
    expect(stripEvalSummaryMarker(input)).toBe(
      'Quote: 1 SUI → 0.913593 USDC (0.05% impact via Bluefin). Executing now.',
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.8 follow-up · Bug C — `<thinking>` leak into chat text
// ───────────────────────────────────────────────────────────────────────────
describe('stripThinkingTags', () => {
  it('returns input unchanged when no marker is present', () => {
    expect(stripThinkingTags('Compiling into one Payment Intent')).toBe(
      'Compiling into one Payment Intent',
    );
  });

  it('returns empty string unchanged', () => {
    expect(stripThinkingTags('')).toBe('');
  });

  it('strips a complete marker with surrounding whitespace', () => {
    const input =
      '<thinking>\n\nThe guard is checking that swap_quote was called.\n\n</thinking>\n\nExecuting now.';
    expect(stripThinkingTags(input)).toBe('Executing now.');
  });

  it('strips a marker in the middle of text', () => {
    const input = 'Before. <thinking>let me think</thinking> After.';
    expect(stripThinkingTags(input)).toBe('Before.After.');
  });

  it('strips multiple complete markers', () => {
    const input = 'A.\n<thinking>x</thinking>\nB.\n<thinking>y</thinking>\nC.';
    expect(stripThinkingTags(input)).toBe('A.B.C.');
  });

  it('truncates at an unclosed marker (streaming case)', () => {
    const input = 'Executing now.\n\n<thinking>let me re-fetch';
    expect(stripThinkingTags(input)).toBe('Executing now.');
  });

  it('handles only the marker (entire text is the marker)', () => {
    const input = '<thinking>internal reasoning</thinking>';
    expect(stripThinkingTags(input)).toBe('');
  });

  it('preserves long unrelated text untouched (early return path)', () => {
    const input = 'Long assistant text without any marker present here.';
    expect(stripThinkingTags(input)).toBe(input);
  });

  it('the founder-repro 2026-05-03 trace renders cleanly', () => {
    const input =
      '<thinking>\n\nThe guard is checking that swap_quote was called IMMEDIATELY before swap_execute in the same turn. I called swap_quote twice earlier, then moved to update_todo and plan narration, then the user said "yes". Now when I try to execute, the guard has timed out or doesn\'t consider those old quotes fresh anymore.\n\nI need to call swap_quote again to refresh the quotes before executing. Let me re-quote both swaps.\n\n</thinking>';
    expect(stripThinkingTags(input)).toBe('');
  });
});
