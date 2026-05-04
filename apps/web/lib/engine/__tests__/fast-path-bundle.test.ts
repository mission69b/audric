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
import type { Message } from '@t2000/engine';
import {
  tryConsumeFastPathBundle,
  __testOnly__,
} from '../fast-path-bundle';
import * as store from '../bundle-proposal-store';
import type { BundleProposal } from '../bundle-proposal-store';

// [SPEC 15 Phase 1.5] Helpers for plan-context override tests. The
// fast-path admits a non-regex affirmative ("do it bro") only when the
// PRIOR ASSISTANT TURN is a multi-write Payment Stream plan. These
// builders construct that history shape.
function asstText(text: string): Message {
  return { role: 'assistant', content: [{ type: 'text', text }] };
}
function userText(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }] };
}

const PLAN_3OP_HISTORY: Message[] = [
  userText('swap 0.5 USDC to USDsui, save the USDsui, send 0.05 USDC to funkii.sui'),
  asstText(
    [
      'Plan:',
      '1. Swap 0.5 USDC → USDsui',
      '2. Save the USDsui to NAVI',
      '3. Send 0.05 USDC to funkii.sui',
      '',
      'Confirm to proceed?',
    ].join('\n'),
  ),
];

const NO_PLAN_HISTORY: Message[] = [
  userText('what is my balance'),
  asstText('Your wallet has 10 USDC. Net worth: $10.'),
];

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
    // [May 3 soak fix] The ack MUST be past-or-in-flight tense, not
    // forward-looking ("Compiling..."), because by the time the
    // narration LLM sees this message the bundle has already settled.
    // Forward-looking text triggers a 2k-char detective-work tangent.
    expect(result!.syntheticAssistantText).not.toContain('Compiling');
    expect(result!.syntheticAssistantText.toLowerCase()).toMatch(
      /\bdispatched\b|\bexecuted\b|\bverif/,
    );
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

// ─────────────────────────────────────────────────────────────────────────
// [SPEC 15 Phase 1.5 / 2026-05-04] Plan-context override admission path.
//
// Production regression repro (04:31:14 UTC, session
// s_1777869041294_b08b00870611):
//   Plan turn proposed a 3-op atomic bundle. User typed "do it bro".
//   Phase 1 promotion fired correctly (Sonnet medium handled the turn)
//   but the fast-path bypass skipped — regex didn't match — and Sonnet
//   re-planned the work, decomposing the 3-op atomic bundle into:
//     TX 1: Standalone swap_execute
//     TX 2: 2-op atomic (save_deposit + send_transfer)
//   The original bundleId 9b1a2397-... was abandoned.
//
// Phase 1.5 fix: when the regex misses but the prior turn IS a
// multi-write plan AND the message isn't clearly negative, admit
// the fast path with `admitted_via=plan_context`.
// ─────────────────────────────────────────────────────────────────────────

describe('tryConsumeFastPathBundle — Phase 1.5 plan-context override', () => {
  let consumeSpy: MockInstance<typeof store.consumeBundleProposal>;
  let counterSpy: MockInstance;

  beforeEach(async () => {
    consumeSpy = vi.spyOn(store, 'consumeBundleProposal');
    const engineModule = await import('@t2000/engine');
    counterSpy = vi.fn();
    engineModule.setTelemetrySink({
      counter: counterSpy as unknown as (
        name: string,
        tags?: Record<string, string | number>,
      ) => void,
      gauge: vi.fn(),
      histogram: vi.fn(),
    });
  });

  afterEach(async () => {
    consumeSpy.mockRestore();
    const engineModule = await import('@t2000/engine');
    engineModule.resetTelemetrySink();
  });

  describe('strict regex path (admitted_via=regex)', () => {
    it('dispatches "Confirm" with admitted_via=regex (legacy 108ms path)', async () => {
      consumeSpy.mockResolvedValueOnce(makeProposal());
      const result = await tryConsumeFastPathBundle({
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'Confirm',
        turnIndex: 0,
        history: PLAN_3OP_HISTORY,
      });
      expect(result).not.toBeNull();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_dispatched',
        expect.objectContaining({ admitted_via: 'regex' }),
      );
    });
  });

  describe('plan-context override path (admitted_via=plan_context)', () => {
    it.each([
      // The exact production repro
      'do it bro',
      // Casual / colloquial
      'send it',
      "let's go",
      'yolo',
      // Multi-language affirmatives (ASCII Spanish)
      'vamos',
      'dale',
      // Voice-to-text artifacts
      'yeah do it',
      'yes uh fire it',
      // Typos NOT in Fix 1's pattern
      'confurm',
      'execte',
      // Emoji NOT in Fix 1's pattern
      '✅',
      '🚀',
      // Qualified-yes (long; would fail length cap on regex)
      'yes please change leg 3 to 0.1 USDC',
    ])('admits "%s" via plan_context when prior turn is multi-write plan', async (msg) => {
      consumeSpy.mockResolvedValueOnce(makeProposal());
      const result = await tryConsumeFastPathBundle({
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: msg,
        turnIndex: 0,
        history: PLAN_3OP_HISTORY,
      });
      expect(result).not.toBeNull();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_dispatched',
        expect.objectContaining({ admitted_via: 'plan_context' }),
      );
    });
  });

  describe('negative reply gate (skip with reason=negative_reply)', () => {
    it.each([
      'no',
      'No',
      'wait',
      'cancel',
      'stop',
      'actually let me think',
      'nvm',
      "don't do it",
      'change leg 3 first',
      'modify the amount',
      'skip leg 3',
    ])('blocks "%s" even when plan-context is detected', async (msg) => {
      const result = await tryConsumeFastPathBundle({
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: msg,
        turnIndex: 0,
        history: PLAN_3OP_HISTORY,
      });
      expect(result).toBeNull();
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'negative_reply' }),
      );
    });
  });

  describe('no-plan-context skip (reason=no_plan_context)', () => {
    it('skips when prior turn is informational (not a plan)', async () => {
      const result = await tryConsumeFastPathBundle({
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'do it bro',
        turnIndex: 0,
        history: NO_PLAN_HISTORY,
      });
      expect(result).toBeNull();
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'no_plan_context' }),
      );
    });
  });

  describe('legacy not_affirmative skip (no history)', () => {
    it('falls back to not_affirmative when no history is provided', async () => {
      const result = await tryConsumeFastPathBundle({
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'do it bro',
        turnIndex: 0,
        // history omitted — backward-compat path
      });
      expect(result).toBeNull();
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'not_affirmative' }),
      );
    });
  });

  describe('production regression repro (the bug Phase 1.5 fixes)', () => {
    it('dispatches the prepared 3-op bundle on "do it bro" instead of decomposing', async () => {
      // Exact repro of session s_1777869041294_b08b00870611 @ 04:31:14.
      // Without Phase 1.5: fast-path skipped → Sonnet re-planned →
      // 2 transactions instead of 1 atomic.
      // With Phase 1.5: fast-path dispatches the prepared bundleId.
      const proposal = makeProposal({
        bundleId: '9b1a2397-5199-4c93-88ff-f1fdd65d9c17',
        steps: [
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 0.5 } },
          { toolName: 'save_deposit', input: { asset: 'USDsui' }, inputCoinFromStep: 0 },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 0.05, to: 'funkii.sui' } },
        ],
      });
      consumeSpy.mockResolvedValueOnce(proposal);

      const result = await tryConsumeFastPathBundle({
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'do it bro',
        turnIndex: 7,
        history: PLAN_3OP_HISTORY,
      });

      // Bundle dispatched as ONE atomic PTB
      expect(result).not.toBeNull();
      expect(result!.action.steps).toHaveLength(3);
      // The same bundleId from the prepared stash propagates through
      // (via the proposal — toolUseId uses the stashed bundleId).
      expect(result!.action.steps![0].toolUseId).toContain('9b1a2397');
      // admitted_via tag for the dashboard
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_dispatched',
        expect.objectContaining({
          admitted_via: 'plan_context',
          step_count: '3',
        }),
      );
    });
  });
});
