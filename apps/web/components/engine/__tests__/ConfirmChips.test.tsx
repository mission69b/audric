// ───────────────────────────────────────────────────────────────────────────
// SPEC 15 Phase 2 commit 2 — ConfirmChips tests
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { ConfirmChips } from '../ConfirmChips';
import type { ExpectsConfirmPayload } from '@/lib/engine-types';

const stash: ExpectsConfirmPayload = {
  variant: 'commit',
  stashId: 'bundle-abc-123',
  stepCount: 2,
};

describe('ConfirmChips', () => {
  it('renders Confirm + Cancel buttons with the right labels', () => {
    render(<ConfirmChips payload={stash} onChipDecision={() => {}} />);
    expect(screen.getByRole('button', { name: /Confirm the proposed plan/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cancel the proposed plan/i })).toBeTruthy();
  });

  it('invokes onChipDecision with value=yes + forStashId on Confirm click', () => {
    const onChipDecision = vi.fn();
    render(<ConfirmChips payload={stash} onChipDecision={onChipDecision} />);
    fireEvent.click(screen.getByRole('button', { name: /Confirm the proposed plan/i }));
    expect(onChipDecision).toHaveBeenCalledWith({
      value: 'yes',
      forStashId: 'bundle-abc-123',
    });
  });

  it('invokes onChipDecision with value=no + forStashId on Cancel click', () => {
    const onChipDecision = vi.fn();
    render(<ConfirmChips payload={stash} onChipDecision={onChipDecision} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel the proposed plan/i }));
    expect(onChipDecision).toHaveBeenCalledWith({
      value: 'no',
      forStashId: 'bundle-abc-123',
    });
  });

  it('locks both chips after one click (idempotent against double-click races)', () => {
    const onChipDecision = vi.fn();
    render(<ConfirmChips payload={stash} onChipDecision={onChipDecision} />);
    const confirmBtn = screen.getByRole('button', { name: /Confirm the proposed plan/i });
    const cancelBtn = screen.getByRole('button', { name: /Cancel the proposed plan/i });

    fireEvent.click(confirmBtn);
    expect(onChipDecision).toHaveBeenCalledTimes(1);

    // Re-clicking either chip after the first click is a no-op.
    fireEvent.click(confirmBtn);
    fireEvent.click(cancelBtn);
    expect(onChipDecision).toHaveBeenCalledTimes(1);

    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables both chips when `disabled` prop is set (parent-level lockout)', () => {
    const onChipDecision = vi.fn();
    render(<ConfirmChips payload={stash} onChipDecision={onChipDecision} disabled />);
    const confirmBtn = screen.getByRole('button', { name: /Confirm the proposed plan/i });
    fireEvent.click(confirmBtn);
    expect(onChipDecision).not.toHaveBeenCalled();
  });

  it('does not show a countdown for non-swap bundles (expiresAt undefined)', () => {
    render(<ConfirmChips payload={stash} onChipDecision={() => {}} />);
    expect(screen.queryByText(/s left/i)).toBeNull();
    expect(screen.queryByText(/Quote expired/i)).toBeNull();
  });

  describe('expiresAt countdown (swap bundles)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows "Ns left" when within 10s of expiry', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 8_000 }}
          onChipDecision={() => {}}
        />,
      );
      expect(screen.getByText(/8s left/i)).toBeTruthy();
    });

    it('does NOT show countdown when expiresAt is more than 10s away', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 25_000 }}
          onChipDecision={() => {}}
        />,
      );
      expect(screen.queryByText(/s left/i)).toBeNull();
    });

    it('locks the chips + shows "Quote expired" once expiresAt has passed', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      const onChipDecision = vi.fn();
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 5_000 }}
          onChipDecision={onChipDecision}
        />,
      );
      // Tick past expiry — the countdown interval re-renders, locking the chips.
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      // Without `onRefresh` wired, the legacy copy is rendered and
      // the user has to type a fresh request manually.
      expect(screen.getByText(/Quote expired — ask for a fresh one/i)).toBeTruthy();
      const confirmBtn = screen.getByRole('button', { name: /Confirm the proposed plan/i });
      fireEvent.click(confirmBtn);
      expect(onChipDecision).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // [v0.4 — Refresh-on-expiry]
  //
  // Refresh chip surfaces ONLY when the parent provides `onRefresh` AND
  // the quote has expired AND no Confirm/Cancel turn is mid-flight.
  // Click → fires `onRefresh` once (one-shot latch — same pattern as
  // the Confirm/Cancel click latch). Plan-context promotion in the
  // backend handles the "redo this plan" semantics; the component
  // itself stays dumb about which message gets re-sent.
  // ─────────────────────────────────────────────────────────────────────────
  describe('Refresh-on-expiry chip (v0.4)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('does NOT render Refresh chip pre-expiry, even with onRefresh wired', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      const onRefresh = vi.fn();
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 25_000 }}
          onChipDecision={() => {}}
          onRefresh={onRefresh}
        />,
      );
      expect(screen.queryByRole('button', { name: /Refresh the quote/i })).toBeNull();
    });

    it('does NOT render Refresh chip on expiry when onRefresh is omitted (legacy path)', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 5_000 }}
          onChipDecision={() => {}}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.queryByRole('button', { name: /Refresh the quote/i })).toBeNull();
      // Legacy copy is the user's recovery cue when the parent did not wire onRefresh.
      expect(screen.getByText(/Quote expired — ask for a fresh one/i)).toBeTruthy();
    });

    it('renders Refresh chip + short "Quote expired" label once expired AND onRefresh is wired', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      const onRefresh = vi.fn();
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 5_000 }}
          onChipDecision={() => {}}
          onRefresh={onRefresh}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.getByRole('button', { name: /Refresh the quote/i })).toBeTruthy();
      // Short label — no "ask for a fresh one" suffix when the chip is present
      // (the chip itself IS the recovery action, the suffix would be redundant).
      expect(screen.queryByText(/ask for a fresh one/i)).toBeNull();
      expect(screen.getByText(/^Quote expired$/i)).toBeTruthy();
    });

    it('invokes onRefresh exactly once on click + locks the chip (idempotent vs double-click)', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      const onRefresh = vi.fn();
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 5_000 }}
          onChipDecision={() => {}}
          onRefresh={onRefresh}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      const refreshBtn = screen.getByRole('button', { name: /Refresh the quote/i });
      fireEvent.click(refreshBtn);
      fireEvent.click(refreshBtn);
      fireEvent.click(refreshBtn);
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect((refreshBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('does NOT render Refresh chip when a Confirm/Cancel click is mid-flight (clicked latch)', () => {
      // The Confirm/Cancel chips disable on click but the streaming response
      // hasn't unmounted us yet. If the quote happened to expire DURING that
      // streaming window, the Refresh chip should stay hidden so the user
      // doesn't fire a contradictory refresh on top of an in-flight dispatch.
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      const onChipDecision = vi.fn();
      const onRefresh = vi.fn();
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 5_000 }}
          onChipDecision={onChipDecision}
          onRefresh={onRefresh}
        />,
      );
      // Click Confirm — sets the click latch.
      fireEvent.click(screen.getByRole('button', { name: /Confirm the proposed plan/i }));
      // Tick past expiry while still "clicked".
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.queryByRole('button', { name: /Refresh the quote/i })).toBeNull();
    });

    it('does NOT render Refresh chip when parent forces `disabled` (parent-level lockout)', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      const onRefresh = vi.fn();
      render(
        <ConfirmChips
          payload={{ ...stash, expiresAt: now + 5_000 }}
          onChipDecision={() => {}}
          onRefresh={onRefresh}
          disabled
        />,
      );
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.queryByRole('button', { name: /Refresh the quote/i })).toBeNull();
    });
  });
});
