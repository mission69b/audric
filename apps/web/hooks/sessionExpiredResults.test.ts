import { describe, it, expect } from 'vitest';
import {
  makeExpiredSingleResult,
  makeExpiredBundleResult,
} from './sessionExpiredResults';
import { SESSION_EXPIRED_USER_MESSAGE } from './executeToolAction';
import type { PendingAction } from '@/lib/engine-types';

describe('sessionExpiredResults — single-write shape', () => {
  it('matches the SDK error-catch path exactly (executeToolAction.ts ~line 75-83)', () => {
    const result = makeExpiredSingleResult();
    expect(result).toEqual({
      success: false,
      data: {
        success: false,
        error: SESSION_EXPIRED_USER_MESSAGE,
        _sessionExpired: true,
      },
    });
  });

  it('outer success is false (drives BundleReceiptBlockView session-expired branch)', () => {
    const result = makeExpiredSingleResult();
    expect(result.success).toBe(false);
  });

  it('inner data carries _sessionExpired sentinel (drives engine resume short-circuit)', () => {
    const result = makeExpiredSingleResult();
    expect(result.data._sessionExpired).toBe(true);
  });

  it('uses the canonical user-facing message (no separate copy in pre-flight path)', () => {
    const result = makeExpiredSingleResult();
    expect(result.data.error).toBe(SESSION_EXPIRED_USER_MESSAGE);
    expect(result.data.error).toContain('sign back in');
    expect(result.data.error).toContain('funds are safe');
  });
});

describe('sessionExpiredResults — bundle shape', () => {
  function makeAction(stepCount: number): PendingAction {
    return {
      toolName: 'bundle',
      toolUseId: 'top-tool-use-id',
      input: {},
      attemptId: 'top-attempt-id',
      permissionLevel: 'confirm',
      description: 'test',
      assistantContent: [],
      turnIndex: 0,
      steps: Array.from({ length: stepCount }, (_, i) => ({
        toolName: i === 0 ? 'send_transfer' : 'swap_execute',
        toolUseId: `step-${i}-tool-use-id`,
        attemptId: `step-${i}-attempt-id`,
        input: { amount: 1 + i },
        description: `step ${i}`,
      })),
    } as unknown as PendingAction;
  }

  it('produces N stepResults for an N-step bundle (atomic-revert semantics)', () => {
    const action = makeAction(3);
    const result = makeExpiredBundleResult(action);
    expect(result.stepResults).toHaveLength(3);
  });

  it('every step gets _sessionExpired (NOT _bundleReverted — semantically distinct)', () => {
    const action = makeAction(2);
    const result = makeExpiredBundleResult(action);
    for (const step of result.stepResults) {
      expect(step.result._sessionExpired).toBe(true);
      expect((step.result as Record<string, unknown>)._bundleReverted).toBeUndefined();
    }
  });

  it('preserves toolUseId + attemptId per step (resume route keys updateMany on these)', () => {
    const action = makeAction(2);
    const result = makeExpiredBundleResult(action);
    expect(result.stepResults[0]?.toolUseId).toBe('step-0-tool-use-id');
    expect(result.stepResults[0]?.attemptId).toBe('step-0-attempt-id');
    expect(result.stepResults[1]?.toolUseId).toBe('step-1-tool-use-id');
    expect(result.stepResults[1]?.attemptId).toBe('step-1-attempt-id');
  });

  it('outer sessionExpired flag is true (dashboard skips Anthropic resume call)', () => {
    const action = makeAction(1);
    const result = makeExpiredBundleResult(action);
    expect(result.sessionExpired).toBe(true);
  });

  it('every step is isError: true (engine treats as failed for compaction)', () => {
    const action = makeAction(3);
    const result = makeExpiredBundleResult(action);
    for (const step of result.stepResults) {
      expect(step.isError).toBe(true);
    }
  });

  it('handles empty steps[] gracefully (defensive — should never happen)', () => {
    const action = { ...makeAction(0), steps: undefined } as PendingAction;
    const result = makeExpiredBundleResult(action);
    expect(result.stepResults).toEqual([]);
    expect(result.sessionExpired).toBe(true);
  });
});

describe('sessionExpiredResults — shape parity with SDK error path', () => {
  it('single-write shape matches what executeToolAction.ts returns on EnokiSessionExpiredError', () => {
    // This guards against drift: if the SDK error catch in executeToolAction.ts
    // (line ~75-83) ever changes its emitted shape, this test will keep the
    // pre-flight gate in lockstep.
    const result = makeExpiredSingleResult();
    expect(Object.keys(result).sort()).toEqual(['data', 'success']);
    expect(Object.keys(result.data).sort()).toEqual(['_sessionExpired', 'error', 'success']);
  });

  it('bundle step-result shape matches what executeBundleAction returns on EnokiSessionExpiredError', () => {
    // Guards against drift with executeToolAction.ts ~line 575-592 (the
    // bundle catch path that synthesizes per-step results).
    const action = makeExpiredBundleResult({
      steps: [{ toolName: 't', toolUseId: 'u', attemptId: 'a', input: {}, description: 'd' }],
    } as unknown as PendingAction);
    const step = action.stepResults[0];
    expect(step).toBeDefined();
    expect(Object.keys(step!).sort()).toEqual(['attemptId', 'isError', 'result', 'toolUseId']);
    expect(Object.keys(step!.result).sort()).toEqual(['_sessionExpired', 'error', 'success']);
  });
});
