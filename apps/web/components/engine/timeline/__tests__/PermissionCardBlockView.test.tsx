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
    const { container, queryByRole } = render(
      <PermissionCardBlockView
        block={makeBlock('pending')}
        onActionResolve={vi.fn()}
        shouldAutoApprove={shouldAutoApprove}
      />,
    );
    expect(queryByRole('alertdialog')).toBeNull();
    expect(container.firstChild).toBeNull();
    expect(shouldAutoApprove).toHaveBeenCalledWith({
      toolName: 'send_transfer',
      input: { amount: 10, to: '0xabc' },
    });
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
