/**
 * Unit tests for `expects-confirm-decorator.ts` (SPEC 15 Phase 2).
 *
 * The decorator is a pure server-side function with one I/O dependency
 * (`readBundleProposal` from `bundle-proposal-store`). We `vi.spyOn`
 * the store module to drive each gate independently.
 *
 * Test surfaces (12 cases):
 *   1. preparedBundleThisTurn=false → no I/O, returns null
 *   2. stash missing (TTL-expired or never written) → returns null
 *   3. finalText empty → returns null
 *   4. finalText missing PRIOR_PLAN_MARKER → returns null
 *   5. happy path: swap-bearing 3-op bundle → variant=commit, stashId, stepCount, expiresAt set
 *   6. happy path: non-swap 2-op bundle → expiresAt undefined
 *   7. matches "Confirm to proceed?" plan tail
 *   8. matches "Shall I proceed?" plan tail
 *   9. case-insensitive marker match
 *  10. decorator does NOT consume stash (read-only — `readBundleProposal`
 *      uses GET, not GET+DEL)
 *  11. stepCount surfaced from proposal.steps.length
 *  12. multi-step bundle with mix of swap + non-swap → has_swap inferred
 *      correctly (any swap_execute step → expiresAt set)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { expectsConfirmDecorator } from '../expects-confirm-decorator';
import * as store from '../bundle-proposal-store';
import type { BundleProposal } from '../bundle-proposal-store';

function makeProposal(overrides?: Partial<BundleProposal>): BundleProposal {
  return {
    bundleId: 'bundle-uuid-phase2-test',
    walletAddress: '0xwallet',
    steps: [
      { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
      { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' } },
    ],
    expiresAt: Date.now() + 60_000,
    validatedAt: Date.now(),
    summary: 'withdraw 3 USDC → send 1 USDC',
    ...overrides,
  };
}

const PLAN_TEXT_CONFIRM = 'Plan:\n1. Swap 0.5 USDC → USDsui\n2. Save USDsui\n\nConfirm to proceed?';
const PLAN_TEXT_SHALL = 'I will swap 0.5 USDC then save it. Shall I proceed?';
const NON_PLAN_TEXT = 'Your wallet has 10 USDC. Net worth is $10.';

describe('expectsConfirmDecorator', () => {
  let readSpy: MockInstance<typeof store.readBundleProposal>;

  beforeEach(() => {
    readSpy = vi.spyOn(store, 'readBundleProposal');
  });

  afterEach(() => {
    readSpy.mockRestore();
  });

  it('returns null and SKIPS the Redis read when preparedBundleThisTurn=false', async () => {
    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: false,
      finalText: PLAN_TEXT_CONFIRM,
    });
    expect(result).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('returns null when no stash exists (TTL-expired or never written)', async () => {
    readSpy.mockResolvedValueOnce(null);
    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: PLAN_TEXT_CONFIRM,
    });
    expect(result).toBeNull();
    expect(readSpy).toHaveBeenCalledOnce();
  });

  it('returns null when finalText is undefined', async () => {
    readSpy.mockResolvedValueOnce(makeProposal());
    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: undefined,
    });
    expect(result).toBeNull();
  });

  it('returns null when finalText does not contain "confirm" or "proceed"', async () => {
    readSpy.mockResolvedValueOnce(makeProposal());
    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: NON_PLAN_TEXT,
    });
    expect(result).toBeNull();
  });

  it('happy path: returns commit-variant event with stashId, stepCount, expiresAt for a swap-bearing bundle', async () => {
    const expiresAt = Date.now() + 60_000;
    readSpy.mockResolvedValueOnce(
      makeProposal({
        bundleId: 'bundle-uuid-1',
        steps: [
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 0.5 } },
          { toolName: 'save_deposit', input: { asset: 'USDsui' }, inputCoinFromStep: 0 },
          { toolName: 'send_transfer', input: { amount: 0.05, asset: 'USDC', to: 'funkii.sui' } },
        ],
        expiresAt,
      }),
    );

    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: PLAN_TEXT_CONFIRM,
    });

    expect(result).not.toBeNull();
    expect(result).toEqual({
      type: 'expects_confirm',
      variant: 'commit',
      stashId: 'bundle-uuid-1',
      expiresAt,
      stepCount: 3,
    });
  });

  it('non-swap bundle: returns event with expiresAt UNDEFINED (no quote staleness)', async () => {
    readSpy.mockResolvedValueOnce(
      makeProposal({
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { toolName: 'save_deposit', input: { asset: 'USDC' }, inputCoinFromStep: 0 },
        ],
      }),
    );

    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: PLAN_TEXT_CONFIRM,
    });

    expect(result).not.toBeNull();
    expect(result?.expiresAt).toBeUndefined();
  });

  it('matches "Confirm to proceed?" plan tail', async () => {
    readSpy.mockResolvedValueOnce(makeProposal());
    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: 'Confirm to proceed?',
    });
    expect(result).not.toBeNull();
  });

  it('matches "Shall I proceed?" plan tail', async () => {
    readSpy.mockResolvedValueOnce(makeProposal());
    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: PLAN_TEXT_SHALL,
    });
    expect(result).not.toBeNull();
  });

  it('marker match is case-insensitive ("CONFIRM")', async () => {
    readSpy.mockResolvedValueOnce(makeProposal());
    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: 'Plan locked. CONFIRM to dispatch.',
    });
    expect(result).not.toBeNull();
  });

  it('decorator does NOT consume stash (uses readBundleProposal, GET only)', async () => {
    // Verify by spying on consumeBundleProposal AND deleteBundleProposal —
    // neither should be called by the decorator, only readBundleProposal.
    const consumeSpy = vi.spyOn(store, 'consumeBundleProposal');
    const deleteSpy = vi.spyOn(store, 'deleteBundleProposal');
    readSpy.mockResolvedValueOnce(makeProposal());

    await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: PLAN_TEXT_CONFIRM,
    });

    expect(consumeSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(readSpy).toHaveBeenCalledOnce();

    consumeSpy.mockRestore();
    deleteSpy.mockRestore();
  });

  it('stepCount mirrors proposal.steps.length', async () => {
    readSpy.mockResolvedValueOnce(
      makeProposal({
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 1 } },
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 1 } },
          { toolName: 'send_transfer', input: { amount: 0.1, asset: 'SUI', to: '0xabc' } },
          { toolName: 'save_deposit', input: { asset: 'USDC', amount: 1 } },
        ],
      }),
    );

    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: PLAN_TEXT_CONFIRM,
    });

    expect(result?.stepCount).toBe(4);
  });

  it('mixed bundle (one swap + non-swaps): has_swap inferred → expiresAt set', async () => {
    const expiresAt = Date.now() + 60_000;
    readSpy.mockResolvedValueOnce(
      makeProposal({
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 1 } },
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 0.5 } },
          { toolName: 'send_transfer', input: { amount: 0.05, asset: 'USDC', to: 'funkii.sui' } },
        ],
        expiresAt,
      }),
    );

    const result = await expectsConfirmDecorator({
      sessionId: 's_1',
      preparedBundleThisTurn: true,
      finalText: PLAN_TEXT_CONFIRM,
    });

    expect(result?.expiresAt).toBe(expiresAt);
  });
});
