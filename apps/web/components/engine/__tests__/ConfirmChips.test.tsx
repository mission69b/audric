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
      expect(screen.getByText(/Quote expired/i)).toBeTruthy();
      const confirmBtn = screen.getByRole('button', { name: /Confirm the proposed plan/i });
      fireEvent.click(confirmBtn);
      expect(onChipDecision).not.toHaveBeenCalled();
    });
  });
});
