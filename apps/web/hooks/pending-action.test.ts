/**
 * [v1.4 Item 6] Tests for the pending-action modification protocol.
 *
 * These exercise the pure overlay helpers shared by `useEngine.resolveAction`
 * (client) and the `/api/engine/resume` route (server). The two sites must
 * agree on how `modifications` flow into `action.input` and how the resulting
 * `pendingActionOutcome` is derived, otherwise analytics drift from reality.
 */
import { describe, it, expect } from 'vitest';
import {
  applyModifications,
  applyModificationsToAction,
  resolveOutcome,
} from '@/lib/engine/apply-modifications';
import type { PendingAction } from '@t2000/engine';

function makeAction(input: unknown): PendingAction {
  return {
    toolName: 'save_deposit',
    toolUseId: 'tu-1',
    input,
    description: 'Save 50 USDC',
    assistantContent: [],
    completedResults: [],
  } as unknown as PendingAction;
}

describe('[v1.4 Item 6] applyModifications', () => {
  it('overlays edited fields onto the original input', () => {
    const merged = applyModifications({ amount: 50, asset: 'USDC' }, { amount: 30 });
    expect(merged).toEqual({ amount: 30, asset: 'USDC' });
  });

  it('returns the original input untouched when no modifications are present', () => {
    const input = { amount: 50, asset: 'USDC' };
    expect(applyModifications(input, undefined)).toBe(input);
    expect(applyModifications(input, {})).toBe(input);
  });

  it('falls back to modifications when the original input is not object-shaped', () => {
    expect(applyModifications(null, { amount: 30 })).toEqual({ amount: 30 });
    expect(applyModifications('legacy', { amount: 30 })).toEqual({ amount: 30 });
  });
});

describe('[v1.4 Item 6] applyModificationsToAction', () => {
  it('produces a new action with modified input and preserves the toolUseId', () => {
    const action = makeAction({ amount: 50, to: '0xabc' });
    const next = applyModificationsToAction(action, { amount: 30 });

    expect(next).not.toBe(action);
    expect(next.input).toEqual({ amount: 30, to: '0xabc' });
    expect(next.toolUseId).toBe(action.toolUseId);
    expect(next.toolName).toBe(action.toolName);
  });

  it('returns the original action when no modifications are supplied', () => {
    const action = makeAction({ amount: 50 });
    expect(applyModificationsToAction(action, undefined)).toBe(action);
    expect(applyModificationsToAction(action, {})).toBe(action);
  });
});

describe('[v1.4 Item 6] resolveOutcome', () => {
  it("flags the turn as 'modified' when modifications are present", () => {
    expect(resolveOutcome(true, { amount: 30 })).toBe('modified');
  });

  it("returns 'approved' / 'declined' from the boolean when no modifications", () => {
    expect(resolveOutcome(true, undefined)).toBe('approved');
    expect(resolveOutcome(false, undefined)).toBe('declined');
    expect(resolveOutcome(true, {})).toBe('approved');
  });

  it('honours an explicit outcome from the client over inference', () => {
    expect(resolveOutcome(true, { amount: 30 }, 'approved')).toBe('approved');
    expect(resolveOutcome(false, undefined, 'modified')).toBe('modified');
  });
});
