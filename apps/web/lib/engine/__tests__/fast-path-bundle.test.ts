/**
 * Unit tests for `fast-path-bundle.ts` (SPEC 14 Phase 2).
 *
 * Two test surfaces:
 *   1. The internal builders (`__testOnly__.buildPendingActionFromProposal`,
 *      `__testOnly__.describeStep`) — pure shape assertions on
 *      constructed `PendingAction`s.
 *   2. The orchestrator `tryConsumeFastPathBundle(opts)` — uses
 *      `vi.spyOn` on `consumeBundleProposal` to drive each skip path
 *      and the happy path; asserts the right telemetry fires.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import {
  tryConsumeFastPathBundle,
  __testOnly__,
} from '../fast-path-bundle';
import * as store from '../bundle-proposal-store';
import type { BundleProposal } from '../bundle-proposal-store';

const { buildPendingActionFromProposal, describeStep } = __testOnly__;

function makeProposal(overrides?: Partial<BundleProposal>): BundleProposal {
  return {
    bundleId: 'bundle-uuid-1',
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

describe('describeStep', () => {
  it('produces a friendly withdraw description', () => {
    expect(describeStep({ toolName: 'withdraw', input: { amount: 3, asset: 'USDC' } }))
      .toBe('Withdraw 3 USDC from savings');
  });
  it('save_deposit with amount + asset', () => {
    expect(describeStep({ toolName: 'save_deposit', input: { amount: 5, asset: 'USDsui' } }))
      .toBe('Save 5 USDsui into lending');
  });
  it('save_deposit without amount falls back to "all"', () => {
    expect(describeStep({ toolName: 'save_deposit', input: { asset: 'USDsui' } }))
      .toBe('Save USDsui into lending');
  });
  it('swap_execute renders from → to', () => {
    expect(describeStep({ toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 3 } }))
      .toBe('Swap 3 USDC → USDsui');
  });
  it('send_transfer renders recipient', () => {
    expect(describeStep({ toolName: 'send_transfer', input: { amount: 1, asset: 'USDC', to: 'funkii.sui' } }))
      .toBe('Send 1 USDC to funkii.sui');
  });
  it('unknown tool falls back to its name', () => {
    expect(describeStep({ toolName: 'mystery_tool', input: {} }))
      .toBe('mystery_tool');
  });
});

describe('buildPendingActionFromProposal', () => {
  it('mirrors steps[0] into top-level fields', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 5);
    expect(action.toolName).toBe(action.steps?.[0].toolName);
    expect(action.toolUseId).toBe(action.steps?.[0].toolUseId);
    expect(action.input).toEqual(action.steps?.[0].input);
    expect(action.description).toBe(action.steps?.[0].description);
    expect(action.attemptId).toBe(action.steps?.[0].attemptId);
  });

  it('stamps a UUID v4 attemptId per step', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 1);
    expect(action.steps).toHaveLength(2);
    for (const step of action.steps!) {
      expect(step.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    }
    // Distinct ids — no collisions
    expect(action.steps![0].attemptId).not.toBe(action.steps![1].attemptId);
  });

  it('uses fastpath_ prefix on toolUseId for log identifiability', () => {
    const proposal = makeProposal({ bundleId: 'abc-123' });
    const action = buildPendingActionFromProposal(proposal, 0);
    expect(action.steps![0].toolUseId).toBe('fastpath_abc-123_0');
    expect(action.steps![1].toolUseId).toBe('fastpath_abc-123_1');
  });

  it('preserves inputCoinFromStep on chained steps', () => {
    const proposal = makeProposal({
      steps: [
        { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
        { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 3 }, inputCoinFromStep: 0 },
        { toolName: 'save_deposit', input: { asset: 'USDsui' }, inputCoinFromStep: 1 },
      ],
    });
    const action = buildPendingActionFromProposal(proposal, 0);
    expect(action.steps).toHaveLength(3);
    expect(action.steps![0].inputCoinFromStep).toBeUndefined();
    expect(action.steps![1].inputCoinFromStep).toBe(0);
    expect(action.steps![2].inputCoinFromStep).toBe(1);
  });

  it('omits inputCoinFromStep when undefined (no key vs key=undefined)', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 0);
    expect('inputCoinFromStep' in action.steps![0]).toBe(false);
  });

  it('passes through turnIndex', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 42);
    expect(action.turnIndex).toBe(42);
  });

  it('returns empty assistantContent + completedResults (no LLM turn)', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 0);
    expect(action.assistantContent).toEqual([]);
    expect(action.completedResults).toEqual([]);
  });
});

describe('tryConsumeFastPathBundle', () => {
  let consumeSpy: MockInstance<typeof store.consumeBundleProposal>;

  beforeEach(() => {
    consumeSpy = vi.spyOn(store, 'consumeBundleProposal');
  });

  afterEach(() => {
    consumeSpy.mockRestore();
  });

  it('returns null when sessionId missing', async () => {
    const result = await tryConsumeFastPathBundle({
      sessionId: undefined,
      walletAddress: '0xwallet',
      trimmedMessage: 'Confirm',
      turnIndex: 1,
    });
    expect(result).toBeNull();
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it('returns null when walletAddress missing', async () => {
    const result = await tryConsumeFastPathBundle({
      sessionId: 's_1',
      walletAddress: undefined,
      trimmedMessage: 'Confirm',
      turnIndex: 1,
    });
    expect(result).toBeNull();
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it('returns null when message is not affirmative', async () => {
    const result = await tryConsumeFastPathBundle({
      sessionId: 's_1',
      walletAddress: '0xwallet',
      trimmedMessage: 'How is the weather?',
      turnIndex: 1,
    });
    expect(result).toBeNull();
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it('returns null when no proposal stashed (steady state)', async () => {
    consumeSpy.mockResolvedValueOnce(null);
    const result = await tryConsumeFastPathBundle({
      sessionId: 's_1',
      walletAddress: '0xwallet',
      trimmedMessage: 'Confirm',
      turnIndex: 1,
    });
    expect(result).toBeNull();
    expect(consumeSpy).toHaveBeenCalledOnce();
  });

  it('returns null when stashed wallet does not match request wallet', async () => {
    consumeSpy.mockResolvedValueOnce(makeProposal({ walletAddress: '0xother' }));
    const result = await tryConsumeFastPathBundle({
      sessionId: 's_1',
      walletAddress: '0xwallet',
      trimmedMessage: 'Confirm',
      turnIndex: 1,
    });
    expect(result).toBeNull();
  });

  it('happy path: returns built action + proposal + synthetic ack text', async () => {
    const proposal = makeProposal();
    consumeSpy.mockResolvedValueOnce(proposal);
    const result = await tryConsumeFastPathBundle({
      sessionId: 's_1',
      walletAddress: '0xwallet',
      trimmedMessage: 'Confirm',
      turnIndex: 7,
    });
    expect(result).not.toBeNull();
    expect(result!.action.steps).toHaveLength(2);
    expect(result!.action.turnIndex).toBe(7);
    expect(result!.proposal).toBe(proposal);
    expect(result!.syntheticAssistantText).toContain('2 writes');
    expect(result!.syntheticAssistantText).toContain('Payment Stream');
  });

  it.each([
    'yes',
    'Yes',
    'YES',
    'y',
    'Y',
    'confirm',
    'Confirm',
    'Confirmed',
    'ok',
    'okay',
    'sure',
    'do it',
    'go',
    'proceed',
    'approve',
    'sounds good',
    "let's do it",
    'ship it',
    '👍',
  ])('treats "%s" as affirmative', async (msg) => {
    consumeSpy.mockResolvedValueOnce(makeProposal());
    const result = await tryConsumeFastPathBundle({
      sessionId: 's_1',
      walletAddress: '0xwallet',
      trimmedMessage: msg,
      turnIndex: 0,
    });
    expect(result).not.toBeNull();
  });

  it.each([
    'why',
    'no',
    'wait',
    'how does this work',
    'show me my balance',
    'change the amount',
    'A very long message that goes on and on past the 30 character cap',
  ])('does NOT treat "%s" as affirmative', async (msg) => {
    const result = await tryConsumeFastPathBundle({
      sessionId: 's_1',
      walletAddress: '0xwallet',
      trimmedMessage: msg,
      turnIndex: 0,
    });
    expect(result).toBeNull();
  });
});
