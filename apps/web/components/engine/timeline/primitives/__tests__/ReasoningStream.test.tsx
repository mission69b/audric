// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — ReasoningStream primitive tests (audit Gap C)
//
// Critical invariants:
//   1. On initial mount, full text is visible immediately (snap-on-mount)
//   2. The italic class only applies while streaming
//   3. The caret ONLY shows while streaming AND revealed < text.length
//   4. Text growth post-mount animates the cursor (uses fake timers)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ReasoningStream } from '../ReasoningStream';

describe('ReasoningStream', () => {
  it('snaps to text.length on initial mount (rehydrate / mid-stream re-render)', () => {
    const { container } = render(
      <ReasoningStream text="Considering the swap…" streaming={true} />,
    );
    // Full text is visible immediately — no animation race.
    expect(container.textContent).toContain('Considering the swap…');
  });

  it('applies italic class while streaming', () => {
    const { container } = render(
      <ReasoningStream text="abc" streaming={true} />,
    );
    expect(container.querySelector('.italic')).toBeTruthy();
  });

  it('drops italic class once streaming flips to false', () => {
    const { container } = render(
      <ReasoningStream text="abc" streaming={false} />,
    );
    expect(container.querySelector('.italic')).toBeNull();
  });

  it('does NOT render the caret when revealed === text.length (initial mount)', () => {
    const { container } = render(
      <ReasoningStream text="abc" streaming={true} />,
    );
    // No animated caret span — revealed already equals text.length.
    const caretCandidates = container.querySelectorAll(
      'span[aria-hidden="true"].animate-pulse',
    );
    expect(caretCandidates.length).toBe(0);
  });

  describe('animation when text grows post-mount', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('walks revealed forward at charsPerTick per tickMs as text grows', () => {
      const { container, rerender } = render(
        <ReasoningStream text="abc" streaming={true} tickMs={20} charsPerTick={2} />,
      );
      expect(container.textContent).toContain('abc');

      // Text grows by 4 chars: rerender simulates a thinking_delta event.
      rerender(
        <ReasoningStream text="abcdefg" streaming={true} tickMs={20} charsPerTick={2} />,
      );
      // Still only `abc` visible — animation hasn't ticked yet.
      // (textContent will contain 'abc' but not 'abcdefg' fully.)
      const beforeTick = container.querySelector('p')?.textContent ?? '';
      expect(beforeTick.startsWith('abc')).toBe(true);
      expect(beforeTick.includes('defg')).toBe(false);

      // Advance timers: 1 tick reveals 2 more chars.
      act(() => {
        vi.advanceTimersByTime(25);
      });
      const afterOneTick = container.querySelector('p')?.textContent ?? '';
      // Walks 3 → 5 — caret may follow, so check the leading text only.
      expect(afterOneTick.startsWith('abcde')).toBe(true);

      // One more tick: revealed catches up to 7 (text.length).
      act(() => {
        vi.advanceTimersByTime(25);
      });
      const afterTwoTicks = container.querySelector('p')?.textContent ?? '';
      expect(afterTwoTicks).toContain('abcdefg');
    });

    it('snaps to text.length immediately when streaming flips to false mid-animation', () => {
      const { container, rerender } = render(
        <ReasoningStream text="abc" streaming={true} tickMs={20} charsPerTick={1} />,
      );
      // Grow text — animation would normally take 4 ticks.
      rerender(
        <ReasoningStream text="abcdefg" streaming={true} tickMs={20} charsPerTick={1} />,
      );
      // Flip streaming OFF before animation completes.
      rerender(
        <ReasoningStream text="abcdefg" streaming={false} tickMs={20} charsPerTick={1} />,
      );
      // Snap to full text + italic class dropped.
      expect(container.querySelector('p')?.textContent).toContain('abcdefg');
      expect(container.querySelector('.italic')).toBeNull();
    });
  });
});
