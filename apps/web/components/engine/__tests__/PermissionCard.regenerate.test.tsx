// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.4b — PermissionCard regenerate slot rendering tests
//
// Covers the Quote-Refresh ReviewCard surface on the bundle render branch:
// the QUOTE Ns OLD badge (with grey/amber severity colors), the
// "↻ Regenerate" button (idle vs. spinner state), the 3-button row gating
// during regeneration, and the no-op when `regenerate` prop is omitted.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { PermissionCard } from '../PermissionCard';
import type { PendingAction } from '@/lib/engine-types';

function fakeBundle(opts: {
  canRegenerate?: boolean;
  quoteAge?: number;
  regenerateInput?: { toolUseIds: string[] };
  steps?: number;
} = {}): PendingAction {
  const stepCount = opts.steps ?? 2;
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    toolName: i === 0 ? 'swap_execute' : 'save_deposit',
    toolUseId: `tu-${i + 1}`,
    attemptId: `attempt-step-${i + 1}`,
    input: i === 0
      ? { from: 'USDC', to: 'SUI', amount: 100 }
      : { amount: 100, asset: 'USDC' },
    description: `step ${i + 1}`,
  }));
  return {
    toolName: steps[0].toolName,
    toolUseId: steps[0].toolUseId,
    input: steps[0].input,
    description: 'Multi-write Payment Stream',
    assistantContent: [],
    turnIndex: 0,
    attemptId: steps[0].attemptId,
    steps,
    canRegenerate: opts.canRegenerate,
    quoteAge: opts.quoteAge,
    regenerateInput: opts.regenerateInput,
  };
}

describe('PermissionCard — regenerate slot (Quote-Refresh ReviewCard)', () => {
  it('does NOT render the Regenerate button when `regenerate` prop is omitted', () => {
    const action = fakeBundle({
      canRegenerate: true,
      quoteAge: 1000,
      regenerateInput: { toolUseIds: ['t1'] },
    });
    const { queryByText } = render(
      <PermissionCard action={action} onResolve={vi.fn()} />,
    );
    expect(queryByText(/Refresh quote/i)).toBeNull();
  });

  it('renders the Refresh quote button when `regenerate` prop is provided', () => {
    const action = fakeBundle({
      canRegenerate: true,
      quoteAge: 1000,
      regenerateInput: { toolUseIds: ['t1'] },
    });
    const onRegenerate = vi.fn();
    const { getByText } = render(
      <PermissionCard
        action={action}
        onResolve={vi.fn()}
        regenerate={{ onRegenerate, isRegenerating: false }}
      />,
    );
    const btn = getByText(/Refresh quote/i);
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('shows "Regenerating…" and disables every button while in flight', () => {
    const action = fakeBundle({
      canRegenerate: true,
      quoteAge: 1000,
      regenerateInput: { toolUseIds: ['t1'] },
    });
    const onResolve = vi.fn();
    const onRegenerate = vi.fn();
    const { getByText } = render(
      <PermissionCard
        action={action}
        onResolve={onResolve}
        regenerate={{ onRegenerate, isRegenerating: true }}
      />,
    );
    const regenBtn = getByText(/Regenerating/i) as HTMLButtonElement;
    expect(regenBtn.disabled).toBe(true);
    const approveBtn = getByText('Approve') as HTMLButtonElement;
    const denyBtn = getByText('Deny') as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
    expect(denyBtn.disabled).toBe(true);
    fireEvent.click(approveBtn);
    fireEvent.click(denyBtn);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('renders the QUOTE Ns OLD badge when `quoteAge` is set', () => {
    const action = fakeBundle({
      canRegenerate: true,
      quoteAge: 47_000,
      regenerateInput: { toolUseIds: ['t1'] },
    });
    const { getByText } = render(
      <PermissionCard
        action={action}
        onResolve={vi.fn()}
        regenerate={{ onRegenerate: vi.fn(), isRegenerating: false }}
      />,
    );
    expect(getByText(/QUOTE.*OLD/i)).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.4b audit — BUG #2 regression
//
// When a regenerate succeeds, the parent swaps the message's pendingAction
// to a fresh action carrying a new `attemptId`. PermissionCard does NOT
// unmount (same key path: parent maps prev messages → swaps `pendingAction`
// in place). The deny-timer countdown and the live-tick `ageMs` formula
// must rebase off the new attemptId, otherwise:
//   - the user gets only leftover seconds on a brand-new quote, AND
//   - the QUOTE Ns OLD badge inflates by the elapsed timer instantly
//     (e.g. fresh `quoteAge=0` + 45s of stale countdown = "QUOTE 45s OLD"
//     the moment the new card lands).
// ───────────────────────────────────────────────────────────────────────────

describe('PermissionCard — regenerate attemptId swap (BUG #2 regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets the deny-timer countdown to TIMEOUT_SEC when attemptId changes', () => {
    const initial = fakeBundle({
      canRegenerate: true,
      quoteAge: 0,
      regenerateInput: { toolUseIds: ['t1'] },
    });
    initial.attemptId = 'attempt-original';

    const { getByLabelText, rerender } = render(
      <PermissionCard
        action={initial}
        onResolve={vi.fn()}
        regenerate={{ onRegenerate: vi.fn(), isRegenerating: false }}
      />,
    );

    // Timer starts at 60s (TIMEOUT_SEC) and ticks down. Advance 30s.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(getByLabelText(/seconds remaining/i).textContent).toBe('30s');

    // Simulate a successful regenerate landing — the parent swaps the
    // action to a fresh one with a new attemptId and quoteAge ≈ 0.
    const refreshed: PendingAction = {
      ...initial,
      attemptId: 'attempt-fresh-after-regen',
      quoteAge: 0,
    };

    rerender(
      <PermissionCard
        action={refreshed}
        onResolve={vi.fn()}
        regenerate={{ onRegenerate: vi.fn(), isRegenerating: false }}
      />,
    );

    // Without the fix, the badge label still showed "30s" (and the badge
    // was about to read "QUOTE 30s OLD"). With the reset, both rebase.
    expect(getByLabelText(/seconds remaining/i).textContent).toBe('60s');
  });
});
