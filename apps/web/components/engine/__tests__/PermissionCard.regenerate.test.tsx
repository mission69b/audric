// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.4b — PermissionCard regenerate slot rendering tests
//
// Covers the Quote-Refresh ReviewCard surface on the bundle render branch:
// the QUOTE Ns OLD badge (with grey/amber severity colors), the
// "↻ Regenerate" button (idle vs. spinner state), the 3-button row gating
// during regeneration, and the no-op when `regenerate` prop is omitted.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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
    expect(queryByText(/Regenerate/i)).toBeNull();
  });

  it('renders the Regenerate button when `regenerate` prop is provided', () => {
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
    const btn = getByText(/Regenerate/i);
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
