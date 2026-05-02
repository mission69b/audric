// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.4 Layer 3 — Multi-step PermissionCard rendering tests
//
// Covers the bundle render branch (action.steps >= 2): step rows, badges,
// UX clustering (swap+save collapse), and atomic Approve/Deny gating.
// Single-write tests live nowhere yet; the bundle branch is the riskiest
// new code path (5 new sub-components, 70 LOC of clustering logic).
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PermissionCard } from '../PermissionCard';
import type { PendingAction } from '@/lib/engine-types';

function fakeBundle(
  steps: Array<{ toolName: string; input: Record<string, unknown>; toolUseId?: string; attemptId?: string }>,
): PendingAction {
  return {
    toolName: steps[0].toolName,
    toolUseId: steps[0].toolUseId ?? 'tool-use-1',
    input: steps[0].input,
    description: 'Multi-write Payment Stream',
    assistantContent: [],
    turnIndex: 0,
    attemptId: steps[0].attemptId ?? 'attempt-1',
    steps: steps.map((s, i) => ({
      toolName: s.toolName,
      toolUseId: s.toolUseId ?? `tool-use-${i + 1}`,
      attemptId: s.attemptId ?? `attempt-${i + 1}`,
      input: s.input,
      description: `step ${i + 1}`,
    })),
  };
}

describe('PermissionCard — bundle (multi-write Payment Stream)', () => {
  it('renders the "N operations · 1 Payment Stream · Atomic" header', () => {
    const action = fakeBundle([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 200 } },
      { toolName: 'send_transfer', input: { to: '0xabc', amount: 100, asset: 'USDC' } },
    ]);
    const { getByText } = render(<PermissionCard action={action} onResolve={vi.fn()} />);
    expect(getByText(/2 operations · 1 Payment Stream · Atomic/)).toBeTruthy();
  });

  it('renders one row per non-clustered step with the correct protocol badge', () => {
    const action = fakeBundle([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 200 } },
      { toolName: 'send_transfer', input: { to: '0xabc', amount: 100 } },
      { toolName: 'volo_stake', input: { amount: 5 } },
    ]);
    const { getAllByText } = render(<PermissionCard action={action} onResolve={vi.fn()} />);

    // One CETUS badge for the swap, one TRANSFER for the send, one VOLO for the stake.
    expect(getAllByText('CETUS')).toHaveLength(1);
    expect(getAllByText('TRANSFER')).toHaveLength(1);
    expect(getAllByText('VOLO')).toHaveLength(1);
  });

  it('clusters swap_execute(to=USDsui) + save_deposit(asset=USDsui) into ONE row with both badges', () => {
    const action = fakeBundle([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 900 } },
      { toolName: 'save_deposit', input: { amount: 900, asset: 'USDsui' } },
    ]);
    const { getAllByText, queryByText } = render(
      <PermissionCard action={action} onResolve={vi.fn()} />,
    );

    // Header still says "2 operations" (the engine emits 2 steps; the UI
    // only collapses the visual row).
    expect(queryByText(/2 operations · 1 Payment Stream · Atomic/)).not.toBeNull();
    // Both badges render on the single clustered row.
    expect(getAllByText('CETUS')).toHaveLength(1);
    expect(getAllByText('NAVI')).toHaveLength(1);
    // The clustered summary mentions both verbs.
    expect(queryByText(/Swap 900 USDC → USDsui \+ save/)).not.toBeNull();
  });

  it('does NOT cluster swap+save when assets differ', () => {
    const action = fakeBundle([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 100 } },
      { toolName: 'save_deposit', input: { amount: 50, asset: 'USDC' } },
    ]);
    const { getAllByText } = render(<PermissionCard action={action} onResolve={vi.fn()} />);

    // 2 separate rows: CETUS badge alone, NAVI badge alone.
    expect(getAllByText('CETUS')).toHaveLength(1);
    expect(getAllByText('NAVI')).toHaveLength(1);
  });

  it('renders the atomicity footer "ALL SUCCEED OR ALL REVERT"', () => {
    const action = fakeBundle([
      { toolName: 'save_deposit', input: { amount: 100, asset: 'USDC' } },
      { toolName: 'send_transfer', input: { to: '0xabc', amount: 50 } },
    ]);
    const { getByText } = render(<PermissionCard action={action} onResolve={vi.fn()} />);
    expect(getByText('ALL SUCCEED OR ALL REVERT')).toBeTruthy();
    expect(getByText('GAS · SPONSORED')).toBeTruthy();
  });

  it('falls back to single-write rendering for 1-step "bundles" (UI density preserved)', () => {
    // A 1-step "bundle" should NOT show the multi-step header — it would
    // be visually dense for no benefit. Render as a single PermissionCard.
    const action = fakeBundle([
      { toolName: 'save_deposit', input: { amount: 100, asset: 'USDC' } },
    ]);
    const { queryByText, getByText } = render(<PermissionCard action={action} onResolve={vi.fn()} />);
    // Single-write path: shows the tool label ("Save deposit"), NOT the
    // multi-step header. Use exact-string matching to avoid colliding
    // with the fakeBundle's `description` field (also contains "Payment
    // Stream" by design — the engine-emitted field would too).
    expect(queryByText(/operations · 1 Payment Stream · Atomic/)).toBeNull();
    expect(getByText('Save deposit')).toBeTruthy();
  });

  it('Approve button calls onResolve(action, true) for the WHOLE bundle (no per-step gating)', () => {
    const onResolve = vi.fn();
    const action = fakeBundle([
      { toolName: 'save_deposit', input: { amount: 100, asset: 'USDC' } },
      { toolName: 'send_transfer', input: { to: '0xabc', amount: 50 } },
    ]);
    const { getByText } = render(<PermissionCard action={action} onResolve={onResolve} />);
    getByText('Approve').click();
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(action, true, undefined, undefined);
  });

  it('Deny button calls onResolve(action, false, "denied") for the WHOLE bundle', () => {
    const onResolve = vi.fn();
    const action = fakeBundle([
      { toolName: 'save_deposit', input: { amount: 100, asset: 'USDC' } },
      { toolName: 'borrow', input: { amount: 200, asset: 'USDC' } },
    ]);
    const { getByText } = render(<PermissionCard action={action} onResolve={onResolve} />);
    getByText('Deny').click();
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(action, false, 'denied', undefined);
  });
});
