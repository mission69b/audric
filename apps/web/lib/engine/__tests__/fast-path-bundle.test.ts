/**
 * Unit tests for `fast-path-bundle.ts` (SPEC 14 Phase 2 + SPEC 15 v0.7
 * follow-up #3 — single-source bundle composer).
 *
 * Two test surfaces:
 *   1. The internal adapter (`__testOnly__.buildPendingActionFromProposal`,
 *      `__testOnly__.findContributingReadsFromHistory`) — pure shape
 *      assertions on the `PendingAction` constructed by handing off to
 *      the engine's canonical `composeBundleFromToolResults`.
 *   2. The orchestrator `tryConsumeFastPathBundle(opts)` — uses
 *      `vi.spyOn` on `consumeBundleProposal` to drive each skip path
 *      and the happy path; asserts the right telemetry fires.
 *
 * **Why use `getDefaultTools()` instead of fake tool stubs.** Pre-#3,
 * the local composer didn't depend on the tool registry — it had a
 * baked-in `describeStep` switch. Now the engine composer needs the
 * registry for `describeAction` + `getModifiableFields` + the
 * bundleable-flag defensive check. `getDefaultTools()` gives us the
 * real production tools (with real flags + real descriptors) so the
 * tests exercise the same code path the chat route hits at runtime.
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
import type { Message, Tool } from '@t2000/engine';
import { getDefaultTools } from '@t2000/engine';
import {
  tryConsumeFastPathBundle,
  __testOnly__,
} from '../fast-path-bundle';
import * as store from '../bundle-proposal-store';
import type { BundleProposal } from '../bundle-proposal-store';

const ENGINE_TOOLS: ReadonlyArray<Tool> = getDefaultTools();

/**
 * Default `tools` baseline for all `tryConsumeFastPathBundle` calls
 * in this file. Required because the post-#3 fast-path delegates to
 * the engine's `composeBundleFromToolResults`, which throws if tools
 * are missing. Tests that exit before composition (no_session,
 * no_wallet, no_stash, etc.) tolerate it being unused; tests that
 * compose require it. Adding it everywhere is the simplest invariant.
 */
const TOOLS_OPT = { tools: ENGINE_TOOLS } as const;

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

const { buildPendingActionFromProposal } = __testOnly__;

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

describe('buildPendingActionFromProposal', () => {
  it('mirrors steps[0] into top-level fields', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 5, ENGINE_TOOLS);
    expect(action.toolName).toBe(action.steps?.[0].toolName);
    expect(action.toolUseId).toBe(action.steps?.[0].toolUseId);
    expect(action.input).toEqual(action.steps?.[0].input);
    expect(action.description).toBe(action.steps?.[0].description);
    expect(action.attemptId).toBe(action.steps?.[0].attemptId);
  });

  it('stamps a UUID v4 attemptId per step', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 1, ENGINE_TOOLS);
    expect(action.steps).toHaveLength(2);
    for (const step of action.steps!) {
      expect(step.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(action.steps![0].attemptId).not.toBe(action.steps![1].attemptId);
  });

  it('uses fastpath_ prefix on toolUseId for log identifiability', () => {
    const proposal = makeProposal({ bundleId: 'abc-123' });
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS);
    expect(action.steps![0].toolUseId).toBe('fastpath_abc-123_0');
    expect(action.steps![1].toolUseId).toBe('fastpath_abc-123_1');
  });

  // [SPEC 15 v0.7 follow-up #3 — single-source bundle composer,
  // 2026-05-04] The engine composer derives `inputCoinFromStep` from
  // `shouldChainCoin(producer, consumer)` rather than passing
  // through whatever the proposal had. For asset-aligned whitelisted
  // pairs, the composer wires chain-mode automatically. For non-
  // whitelisted pairs, chain-mode stays off — even if the proposal
  // had it set (which prepare_bundle would never do; it uses the
  // same shouldChainCoin logic). Pre-#3 the local composer copied
  // proposal.inputCoinFromStep verbatim, so this test changed shape:
  // we now assert the asset-aligned pair (withdraw USDC →
  // swap_execute from USDC) auto-wires.
  it('auto-wires inputCoinFromStep for asset-aligned chained pairs', () => {
    const proposal = makeProposal({
      steps: [
        { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
        { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 3 } },
      ],
    });
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS);
    expect(action.steps).toHaveLength(2);
    expect(action.steps![0].inputCoinFromStep).toBeUndefined();
    // Engine composer wires chain-mode for `withdraw->swap_execute`
    // when producer.asset === consumer.from.
    expect(action.steps![1].inputCoinFromStep).toBe(0);
  });

  it('omits inputCoinFromStep on the first step (nothing to chain from)', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS);
    expect('inputCoinFromStep' in action.steps![0]).toBe(false);
  });

  it('passes through turnIndex', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 42, ENGINE_TOOLS);
    expect(action.turnIndex).toBe(42);
  });

  it('returns empty assistantContent + completedResults (no LLM turn)', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS);
    expect(action.assistantContent).toEqual([]);
    expect(action.completedResults).toEqual([]);
  });

  // [SPEC 15 v0.7 follow-up #3 — single-source bundle composer,
  // 2026-05-04] The engine composer ALWAYS emits canRegenerate as
  // boolean (true/false), not optional. When no contributing reads
  // are found, canRegenerate=false and regenerateInput is omitted.
  // Pre-#3 (#2's local composer) the field was conditionally
  // included; tests adjusted accordingly.

  it('emits canRegenerate=false when no history is provided', () => {
    const proposal = makeProposal();
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS);
    expect(action.canRegenerate).toBe(false);
    expect(action.regenerateInput).toBeUndefined();
    expect(action.quoteAge).toBeUndefined();
  });

  it('emits canRegenerate=false when prior assistant turn has no regeneratable reads', () => {
    const proposal = makeProposal();
    const history: Message[] = [
      userText('what is my balance'),
      asstText('Your balance is $20.'),
    ];
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS, history);
    expect(action.canRegenerate).toBe(false);
    expect(action.regenerateInput).toBeUndefined();
  });

  it('populates canRegenerate + regenerateInput + quoteAge when prior turn ran swap_quote', () => {
    const proposal = makeProposal({
      validatedAt: Date.now() - 12_000,
    });
    const history: Message[] = [
      userText('swap 10 USDC for SUI then save 10 USDC'),
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_swap_quote_1',
            name: 'swap_quote',
            input: { from: 'USDC', to: 'SUI', amount: 10 },
          },
          {
            type: 'tool_use',
            id: 'toolu_prepare_bundle_1',
            name: 'prepare_bundle',
            input: { steps: [] },
          },
        ],
      },
    ];
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS, history);
    expect(action.canRegenerate).toBe(true);
    expect(action.regenerateInput?.toolUseIds).toEqual(['toolu_swap_quote_1']);
    expect(action.quoteAge).toBeGreaterThanOrEqual(11_000);
    expect(action.quoteAge).toBeLessThan(13_000);
  });

  // [SPEC 15 v0.7 follow-up #3 — multi-turn history walk, 2026-05-04]
  // The pre-#3 walk only inspected the last assistant message, which
  // missed `swap_quote` calls that landed in an EARLIER assistant
  // message of the same agent turn (e.g. `swap_quote` in turn-step-1,
  // `prepare_bundle` in turn-step-2). The fix walks ALL assistant
  // messages between the most recent human user message and the end
  // of history.
  it('spans multiple assistant messages within the same agent turn (post-#3)', () => {
    const proposal = makeProposal();
    const history: Message[] = [
      userText('swap 10 USDC for SUI then save 10 USDC'),
      // Step 1 of agent loop — runs swap_quote.
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_swap_quote_1', name: 'swap_quote', input: {} },
        ],
      },
      // Synthetic tool_result echo from engine.
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'toolu_swap_quote_1', content: '...', isError: false },
        ],
      },
      // Step 2 of agent loop — runs prepare_bundle + final text.
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_prepare_bundle_1', name: 'prepare_bundle', input: {} },
          { type: 'text', text: "Here's your plan: …" },
        ],
      },
    ];
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS, history);
    expect(action.canRegenerate).toBe(true);
    expect(action.regenerateInput?.toolUseIds).toEqual(['toolu_swap_quote_1']);
  });

  it('walks BACKWARDS — picks the most recent agent turn, ignores reads from prior agent turns', () => {
    const proposal = makeProposal();
    const history: Message[] = [
      userText('what is the rate'),
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'OLD_swap_quote', name: 'swap_quote', input: {} },
        ],
      },
      userText('ok then bundle this'),
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'FRESH_swap_quote', name: 'swap_quote', input: {} },
        ],
      },
    ];
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS, history);
    expect(action.regenerateInput?.toolUseIds).toEqual(['FRESH_swap_quote']);
  });

  it('filters out non-regeneratable read tools (e.g. prepare_bundle, web_search)', () => {
    const proposal = makeProposal();
    const history: Message[] = [
      userText('do it'),
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_prepare_bundle', name: 'prepare_bundle', input: {} },
          { type: 'tool_use', id: 'toolu_swap_quote', name: 'swap_quote', input: {} },
          { type: 'tool_use', id: 'toolu_unrelated', name: 'web_search', input: {} },
        ],
      },
    ];
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS, history);
    expect(action.regenerateInput?.toolUseIds).toEqual(['toolu_swap_quote']);
  });

  // [SPEC 15 v0.7 follow-up #3] Lurking bug fixed by the converge:
  // chip-confirmed bundles were never carrying `modifiableFields`,
  // because the local composer didn't call `getModifiableFields`.
  // The engine composer does. Verify it now propagates.
  it('populates modifiableFields on each step (engine composer behavior)', () => {
    const proposal = makeProposal({
      steps: [
        { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' } },
        { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xabc' } },
      ],
    });
    const action = buildPendingActionFromProposal(proposal, 0, ENGINE_TOOLS);
    // send_transfer has modifiable amount + to fields per
    // tool-modifiable-fields.ts.
    expect(action.steps![0].modifiableFields?.length ?? 0).toBeGreaterThan(0);
    expect(action.steps![1].modifiableFields?.length ?? 0).toBeGreaterThan(0);
  });

  it('throws when tools are missing (forces caller to plumb engine.getTools)', () => {
    const proposal = makeProposal();
    expect(() => buildPendingActionFromProposal(proposal, 0, undefined)).toThrow(
      /tools.*required/i,
    );
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
      sessionId: 's_1',
      walletAddress: '0xwallet',
      trimmedMessage: 'Confirm',
      turnIndex: 1,
    });
    expect(result).toBeNull();
  });

  it('happy path: returns built action + proposal + synthetic ack text + admittedVia', async () => {
    const proposal = makeProposal();
    consumeSpy.mockResolvedValueOnce(proposal);
    const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
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
    expect(result!.syntheticAssistantText).toContain('Payment Intent');
    // [SPEC 15 Phase 2] admittedVia exposed for chat-route's confirm-flow
    // dispatch counter — text-confirm via strict regex.
    expect(result!.admittedVia).toBe('regex');
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      ...TOOLS_OPT,
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
      // [SPEC 15 Phase 2] admittedVia exposed for chat-route accuracy.
      expect(result!.admittedVia).toBe('plan_context');
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

  // ─────────────────────────────────────────────────────────────────────
  // [SPEC 15 Phase 2 / 2026-05-04] Chip override admission path.
  //
  // Chip click is a 100% intent signal — caller passes
  // `forceAdmit='chip'`. We skip ALL intent checks (regex,
  // negative-reply, plan-context) but the session/stash/wallet
  // gates still run.
  // ─────────────────────────────────────────────────────────────────────

  describe('chip override path (admitted_via=chip)', () => {
    it('admits chip click WITHOUT regex match or history', async () => {
      consumeSpy.mockResolvedValueOnce(makeProposal());
      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: 's_1',
        walletAddress: '0xwallet',
        // Chat route synthesizes message='yes' for telemetry, but
        // forceAdmit='chip' means the regex/plan-context don't matter
        // — we use a clearly non-affirmative string here to prove it.
        trimmedMessage: 'arbitrary placeholder',
        turnIndex: 0,
        forceAdmit: 'chip',
      });
      expect(result).not.toBeNull();
      // Return-shape contract: admittedVia surfaces 'chip' so the
      // chat route's confirm-flow dispatch counter can tag accurately.
      expect(result!.admittedVia).toBe('chip');
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_dispatched',
        expect.objectContaining({ admitted_via: 'chip', step_count: '2' }),
      );
    });

    it('admits chip click EVEN when message would normally be a negative reply', async () => {
      // Chip-Yes click after the user typed "no" in the input but
      // tapped Confirm anyway — chip click wins. (Edge case but the
      // forceAdmit semantics MUST hold.)
      consumeSpy.mockResolvedValueOnce(makeProposal());
      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'no wait',
        turnIndex: 0,
        history: PLAN_3OP_HISTORY,
        forceAdmit: 'chip',
      });
      expect(result).not.toBeNull();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_dispatched',
        expect.objectContaining({ admitted_via: 'chip' }),
      );
    });

    it('chip + missing sessionId → no_session skip (session checks still run)', async () => {
      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: undefined,
        walletAddress: '0xwallet',
        trimmedMessage: 'yes',
        turnIndex: 0,
        forceAdmit: 'chip',
      });
      expect(result).toBeNull();
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'no_session' }),
      );
    });

    it('chip + missing walletAddress → no_wallet skip', async () => {
      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: 's_1',
        walletAddress: undefined,
        trimmedMessage: 'yes',
        turnIndex: 0,
        forceAdmit: 'chip',
      });
      expect(result).toBeNull();
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'no_wallet' }),
      );
    });

    it('chip + no stash → no_stash skip (stash existence still checked)', async () => {
      consumeSpy.mockResolvedValueOnce(null);
      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'yes',
        turnIndex: 0,
        forceAdmit: 'chip',
      });
      expect(result).toBeNull();
      expect(consumeSpy).toHaveBeenCalledOnce();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'no_stash' }),
      );
    });

    it('chip + wallet mismatch → wallet_mismatch skip', async () => {
      consumeSpy.mockResolvedValueOnce(makeProposal({ walletAddress: '0xOTHER' }));
      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'yes',
        turnIndex: 0,
        forceAdmit: 'chip',
      });
      expect(result).toBeNull();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'wallet_mismatch' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // [SPEC 15 Phase 2 / P0-14 ghost-dispatch race regression]
  //
  // Repro shape:
  //   1. Plan turn proposed bundle X. Stash X exists in Redis.
  //   2. User clicks Cancel chip. Chat route calls `deleteBundleProposal`.
  //   3. User next-turn types "save 5 USDC" in the input.
  //   4. New plan turn proposes bundle Y. Stash Y exists in Redis.
  //   5. The old (now-stale) Cancel chip's "Confirm" sibling button is
  //      still in the DOM. User taps it (delayed click on stale UI).
  //   6. Chat route receives `chipDecision: { value: 'yes', forStashId: X }`.
  //      Reads the live stash → bundleId is Y, NOT X. Mismatch.
  //
  // Without the chat-route mismatch check: the chip-Yes path would
  // dispatch Y (the new stash) when the user thought they were
  // approving X. Wrong bundle dispatched.
  //
  // With the mismatch check (chat route): falls through to
  // text-confirm path, which then runs `tryConsumeFastPathBundle`
  // WITHOUT `forceAdmit`. Whether THAT dispatches Y depends on
  // intent gates (regex/plan-context). Since the user typed nothing
  // (chip click sent message='Confirm' as the visible message), regex
  // matches → Y dispatches. The user's intent ("Confirm") is
  // preserved, but the stale stashId binding is NOT honored.
  //
  // The unit-level guarantee tested here is the second leg: AFTER
  // `deleteBundleProposal(X)`, the next `tryConsumeFastPathBundle`
  // returns null with `reason='no_stash'`. (The chat-route's
  // mismatch detour is tested implicitly via typecheck + the
  // spec-consistency assertion.)
  // ─────────────────────────────────────────────────────────────────────

  describe('P0-14: chip-Cancel followed by delayed text-yes returns no_stash', () => {
    it('after deleteBundleProposal, fast-path returns null with reason=no_stash', async () => {
      // The Phase 2 chat-route Cancel handler calls
      // `deleteBundleProposal(sessionId)` directly — that's the
      // ghost-dispatch fix. From the fast-path's perspective, the
      // delayed "yes" arrives against an empty stash.
      consumeSpy.mockResolvedValueOnce(null);

      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'yes',
        turnIndex: 7,
        history: PLAN_3OP_HISTORY,
      });

      expect(result).toBeNull();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'no_stash' }),
      );
    });

    it('after deleteBundleProposal + chip-Yes (forceAdmit), fast-path returns null with reason=no_stash', async () => {
      // Same race shape, except the delayed click goes through the
      // chip path (`forceAdmit='chip'`). Even with intent gates
      // bypassed, the no-stash gate still blocks dispatch — chip
      // semantics preserved.
      consumeSpy.mockResolvedValueOnce(null);

      const result = await tryConsumeFastPathBundle({
      ...TOOLS_OPT,
        sessionId: 's_1',
        walletAddress: '0xwallet',
        trimmedMessage: 'arbitrary',
        turnIndex: 7,
        forceAdmit: 'chip',
      });

      expect(result).toBeNull();
      expect(counterSpy).toHaveBeenCalledWith(
        'audric.bundle.fast_path_skipped',
        expect.objectContaining({ reason: 'no_stash' }),
      );
    });
  });
});
