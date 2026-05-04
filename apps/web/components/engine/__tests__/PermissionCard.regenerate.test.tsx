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

  it('shows "Refreshing…" and disables every button while in flight', () => {
    // [SPEC 15 v0.6] In-flight copy unified with `<ConfirmChips />`'s
    // refresh chip — "Refreshing…" reads consistently across both
    // surfaces. Pre-v0.6 was "Regenerating…".
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
    const regenBtn = getByText(/Refreshing/i) as HTMLButtonElement;
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
// SPEC 15 v0.7 follow-up — single-write regenerate slot (2026-05-04)
//
// Pre-v0.7 the single-write render branch ignored the `regenerate` prop —
// the engine never populated `canRegenerate` on N=1 actions, and the
// PermissionCard's bundle-only `isBundle` gate kept the slot hidden even
// if a host had wired a callback. v0.7 closes the gap end-to-end:
//   - Engine ≥1.16.0 stamps `canRegenerate=true` on confirm-tier
//     single-write actions whose composition consumed a same-turn
//     regeneratable read (e.g. a $50 swap_execute that referenced a
//     prior swap_quote).
//   - Audric host gates `showRegenerate` on `canRegenerate +
//     regenerateInput` only (no `isBundle` check).
//   - PermissionCard's single-write branch renders the same QUOTE Ns OLD
//     badge + "↻ Refresh quote" button as the bundle branch.
// ───────────────────────────────────────────────────────────────────────────

function fakeSingleWrite(opts: {
  canRegenerate?: boolean;
  quoteAge?: number;
  regenerateInput?: { toolUseIds: string[] };
} = {}): PendingAction {
  return {
    toolName: 'swap_execute',
    toolUseId: 'tu-single-1',
    input: { from: 'USDC', to: 'SUI', amount: 50 },
    description: 'Swap 50 USDC → SUI',
    assistantContent: [],
    turnIndex: 0,
    attemptId: 'attempt-single-1',
    canRegenerate: opts.canRegenerate,
    quoteAge: opts.quoteAge,
    regenerateInput: opts.regenerateInput,
    // No `steps` — single-write shape.
  };
}

describe('PermissionCard — single-write regenerate slot (SPEC 15 v0.7)', () => {
  it('does NOT render the Refresh button on a single-write action without canRegenerate', () => {
    // The regression scenario v0.7 was filed against: a confirm-tier
    // swap whose engine never stamped `canRegenerate` (e.g. on engine
    // <1.16.0). The host wires the regenerate prop unconditionally;
    // the card itself stays empty until canRegenerate flips true.
    const action = fakeSingleWrite({});
    const { queryByText } = render(
      <PermissionCard
        action={action}
        onResolve={vi.fn()}
        regenerate={{ onRegenerate: vi.fn(), isRegenerating: false }}
      />,
    );
    expect(queryByText(/Refresh quote/i)).toBeNull();
  });

  it('renders the Refresh quote button on a single-write swap with canRegenerate=true', () => {
    const action = fakeSingleWrite({
      canRegenerate: true,
      quoteAge: 1000,
      regenerateInput: { toolUseIds: ['read-swap-quote-1'] },
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

  it('renders the QUOTE Ns OLD badge on a single-write action when quoteAge is set', () => {
    const action = fakeSingleWrite({
      canRegenerate: true,
      quoteAge: 47_000,
      regenerateInput: { toolUseIds: ['read-1'] },
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

  it('disables Approve + Deny + Refresh on a single-write while regenerating', () => {
    const action = fakeSingleWrite({
      canRegenerate: true,
      quoteAge: 1000,
      regenerateInput: { toolUseIds: ['read-1'] },
    });
    const onResolve = vi.fn();
    const { getByText } = render(
      <PermissionCard
        action={action}
        onResolve={onResolve}
        regenerate={{ onRegenerate: vi.fn(), isRegenerating: true }}
      />,
    );
    const approveBtn = getByText('Approve') as HTMLButtonElement;
    const denyBtn = getByText('Deny') as HTMLButtonElement;
    const refreshBtn = getByText(/Refreshing/i) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
    expect(denyBtn.disabled).toBe(true);
    expect(refreshBtn.disabled).toBe(true);
    fireEvent.click(approveBtn);
    fireEvent.click(denyBtn);
    expect(onResolve).not.toHaveBeenCalled();
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
