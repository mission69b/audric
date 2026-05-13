// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.1 — TransitionChip primitive smoke tests
//
// The chip is a thin Framer-Motion crossfade. These tests pin:
//  1. Each state renders the canonical user-facing copy.
//  2. The status ARIA is wired (`role=status`, `aria-live=polite`,
//     `aria-label` matches the visible label).
//  3. State-driven `data-state` attribute matches the prop (used by
//     Playwright smoke + Storybook visual diffs).
//  4. Two flanking em-rules sit either side of the label (matches the
//     existing `<TaskInitiated>` separator shape so the chip is visually
//     consistent with the legacy "TASK INITIATED" beat that it replaces).
//
// We do NOT test the AnimatePresence motion timing — Framer's own tests
// cover that, and exit-animation timing is environment-sensitive in jsdom.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TransitionChip, type TransitionState } from '../TransitionChip';

const CASES: Array<{ state: TransitionState; label: string }> = [
  { state: 'routing', label: 'ROUTING' },
  { state: 'quoting', label: 'QUOTE IN HAND' },
  { state: 'confirming', label: 'CONFIRMING' },
  { state: 'settling', label: 'SETTLING' },
  { state: 'done', label: 'DONE' },
];

describe('TransitionChip', () => {
  it.each(CASES)('renders "$label" for state="$state"', ({ state, label }) => {
    const { getByText } = render(<TransitionChip state={state} />);
    expect(getByText(label)).toBeTruthy();
  });

  it('exposes a polite status region with the label as aria-label', () => {
    const { getByRole } = render(<TransitionChip state="routing" />);
    const status = getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-label')).toBe('ROUTING');
  });

  it('flanks the label with two aria-hidden em-rules (matches TaskInitiated shape)', () => {
    const { container } = render(<TransitionChip state="quoting" />);
    // Scope to the em-rule divs specifically — since SPEC 23C C10 the
    // AudricMark also carries aria-hidden, so the prior `[aria-hidden]`
    // bare selector started counting it too.
    const rules = container.querySelectorAll('div[aria-hidden="true"]');
    expect(rules.length).toBe(2);
  });

  it('exposes data-state for Playwright smoke targeting', () => {
    const { getByTestId } = render(<TransitionChip state="settling" />);
    const chip = getByTestId('transition-chip');
    expect(chip.getAttribute('data-state')).toBe('settling');
  });

  // We intentionally do NOT test prop-change rerender behavior. AnimatePresence
  // with `mode="wait"` defers the new label mount until exit completes — and
  // exit animations never tick in jsdom (no real raf-driven tweens), so the
  // post-rerender DOM holds the OLD label until the test environment hangs.
  // Production behavior is exercised by the smoke gate (G21-1) instead, and
  // the per-state render tests above already cover the state-driven copy
  // contract for every TransitionState value.

  // ─── SPEC 23C C10 follow-up — AudricMark for in-progress states ────
  //
  // The brand AudricMark renders next to the label for every state
  // EXCEPT `done` (terminal — no longer in progress, so the animated
  // mark would lie about activity). `done` shows the label alone.
  //
  // We assert presence/absence via the `<svg>` AudricMark renders;
  // no other svg lives inside this primitive, so the count is a clean
  // proxy for "is the mark there?".

  const IN_PROGRESS: TransitionState[] = ['routing', 'quoting', 'confirming', 'settling'];

  it.each(IN_PROGRESS)('renders the AudricMark <svg> for in-progress state="%s"', (state) => {
    const { container } = render(<TransitionChip state={state} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(1);
  });

  it('does NOT render the AudricMark for state="done" (terminal state)', () => {
    const { container } = render(<TransitionChip state="done" />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(0);
  });
});
