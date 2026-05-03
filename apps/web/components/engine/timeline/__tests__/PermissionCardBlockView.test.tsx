// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.1 — PermissionCardBlockView smoke tests
//
// Closes audit Gap A + Gap B. The new ReasoningTimeline path renders the
// approve/deny card via this component; without these gates auto-approved
// actions flicker the UI for a frame, and resolved actions stay visually
// "pending" on scroll-back. Both classes of bug are visual-only but the
// fix is structural enough to cover with smoke tests so a regression on
// the prop wiring is loud.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PermissionCardBlockView } from '../PermissionCardBlockView';
import type { PermissionCardTimelineBlock, PendingAction } from '@/lib/engine-types';

function fakeAction(toolName = 'send_transfer'): PendingAction {
  return {
    toolName,
    toolUseId: 'tool-use-1',
    input: { amount: 10, to: '0xabc' },
    description: `${toolName} test`,
    assistantContent: [],
    turnIndex: 0,
    attemptId: 'attempt-1',
  };
}

function makeBlock(
  status: PermissionCardTimelineBlock['status'],
  toolName?: string,
): PermissionCardTimelineBlock {
  return {
    type: 'permission-card',
    payload: fakeAction(toolName),
    status,
  };
}

describe('PermissionCardBlockView', () => {
  it('renders the approve/deny card when status is "pending" and no auto-approve predicate', () => {
    const { queryByRole } = render(
      <PermissionCardBlockView
        block={makeBlock('pending')}
        onActionResolve={vi.fn()}
      />,
    );
    expect(queryByRole('alertdialog')).not.toBeNull();
  });

  it('renders nothing when shouldAutoApprove returns true (audit Gap A)', () => {
    const shouldAutoApprove = vi.fn().mockReturnValue(true);
    const block = makeBlock('pending');
    const { container, queryByRole } = render(
      <PermissionCardBlockView
        block={block}
        onActionResolve={vi.fn()}
        shouldAutoApprove={shouldAutoApprove}
      />,
    );
    expect(queryByRole('alertdialog')).toBeNull();
    expect(container.firstChild).toBeNull();
    // [F14-fix-2 / 2026-05-03] MUST receive the full payload (not just
    // toolName/input). The original implementation passed
    // `{ toolName, input }` which stripped `steps`, hiding the bundle
    // path in `shouldClientAutoApprove` and silently downgrading to
    // step[0]-only logic. Assert reference-equal to lock the contract.
    expect(shouldAutoApprove).toHaveBeenCalledWith(block.payload);
  });

  it('[F14-fix-2] passes bundle steps through to shouldAutoApprove (regression)', () => {
    // The exact production-repro shape: 6-op bundle whose step[0] is
    // auto-tier (`repay $2 USDsui`) under aggressive preset. If `steps`
    // gets stripped at the callsite (the bug we just closed), the
    // single-step fallback inside `shouldClientAutoApprove` returns
    // `true` and the card is hidden — even though step[5] is a `borrow`
    // which always confirms.
    const bundleAction: PendingAction = {
      toolName: 'repay_debt',
      toolUseId: 'tool-use-bundle',
      input: { amount: 2, asset: 'USDsui' },
      description: 'Bundle: repay → swap → swap → save → borrow → send',
      assistantContent: [],
      turnIndex: 0,
      attemptId: 'attempt-bundle',
      steps: [
        {
          toolName: 'repay_debt',
          toolUseId: 'tu-1',
          input: { amount: 2, asset: 'USDsui' },
          description: 'repay',
          attemptId: 'attempt-step-1',
        },
        {
          toolName: 'borrow',
          toolUseId: 'tu-5',
          input: { amount: 1, asset: 'USDsui' },
          description: 'borrow',
          attemptId: 'attempt-step-5',
        },
      ],
    } as PendingAction;
    const block: PermissionCardTimelineBlock = {
      type: 'permission-card',
      payload: bundleAction,
      status: 'pending',
    };
    const shouldAutoApprove = vi.fn().mockReturnValue(false);
    render(
      <PermissionCardBlockView
        block={block}
        onActionResolve={vi.fn()}
        shouldAutoApprove={shouldAutoApprove}
      />,
    );
    expect(shouldAutoApprove).toHaveBeenCalledTimes(1);
    const arg = shouldAutoApprove.mock.calls[0][0];
    // Full payload, including `steps`. If a future refactor cherry-picks
    // `{ toolName, input }`, this test fails loudly.
    expect(arg).toBe(bundleAction);
    expect(Array.isArray(arg.steps)).toBe(true);
    expect(arg.steps).toHaveLength(2);
  });

  it('renders nothing when status is "approved" (audit Gap B — resolved card hidden)', () => {
    const { container, queryByRole } = render(
      <PermissionCardBlockView
        block={makeBlock('approved')}
        onActionResolve={vi.fn()}
      />,
    );
    expect(queryByRole('alertdialog')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is "denied" (audit Gap B)', () => {
    const { container } = render(
      <PermissionCardBlockView
        block={makeBlock('denied')}
        onActionResolve={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the card when shouldAutoApprove returns false', () => {
    const shouldAutoApprove = vi.fn().mockReturnValue(false);
    const { queryByRole } = render(
      <PermissionCardBlockView
        block={makeBlock('pending')}
        onActionResolve={vi.fn()}
        shouldAutoApprove={shouldAutoApprove}
      />,
    );
    expect(queryByRole('alertdialog')).not.toBeNull();
  });
});
