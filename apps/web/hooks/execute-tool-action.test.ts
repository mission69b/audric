import { describe, it, expect, vi } from 'vitest';
import { executeToolAction } from './executeToolAction';
import type { AgentActions } from './useAgent';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';
const VSUI_TYPE = '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';

/**
 * Build a fake AgentActions with the methods we exercise stubbed.
 */
function fakeAgent(overrides: Partial<AgentActions>): AgentActions {
  const base: AgentActions = {
    address: '0xtest',
    send: vi.fn(),
    save: vi.fn(),
    withdraw: vi.fn(),
    borrow: vi.fn(),
    repay: vi.fn(),
    claimRewards: vi.fn(),
    harvestRewards: vi.fn(),
    swap: vi.fn(),
    stakeVSui: vi.fn(),
    unstakeVSui: vi.fn(),
    payService: vi.fn(),
    retryServiceDelivery: vi.fn(),
    executeBundle: vi.fn(),
  };
  return { ...base, ...overrides };
}

describe('executeToolAction — borrow returns parsed disbursed amount, not input', () => {
  it('returns the actual USDC disbursed from balanceChanges, not inp.amount', async () => {
    const sdk = fakeAgent({
      borrow: vi.fn().mockResolvedValue({
        tx: '0xabc',
        // User asked for 100 USDC; protocol disbursed 99.5 (after a fee).
        balanceChanges: [{ coinType: USDC_TYPE, amount: '99500000' }],
      }),
    });

    const out = await executeToolAction(sdk, 'borrow', { amount: 100 });
    expect(out.success).toBe(true);
    const data = out.data as { tx: string; amount: number };
    expect(data.tx).toBe('0xabc');
    expect(data.amount).toBe(99.5);
  });

  it('falls back to inp.amount when balanceChanges is missing', async () => {
    const sdk = fakeAgent({
      borrow: vi.fn().mockResolvedValue({ tx: '0xabc' }),
    });

    const out = await executeToolAction(sdk, 'borrow', { amount: 100 });
    expect((out.data as { amount: number }).amount).toBe(100);
  });
});

describe('executeToolAction — pay_api wraps ServiceDeliveryError into doNotRetry shape', () => {
  it('returns success=false with paymentConfirmed=true and doNotRetry=true', async () => {
    // Lazy-import the error class so vi.mock isn't needed.
    const { ServiceDeliveryError } = await import('./useAgent');

    const sdk = fakeAgent({
      payService: vi.fn().mockRejectedValue(
        new ServiceDeliveryError('downstream 502', '0xpaymentdigest', {
          serviceId: 'svc',
          gatewayUrl: 'https://gw',
          serviceBody: '{}',
          price: '5',
        }),
      ),
    });

    const out = await executeToolAction(sdk, 'pay_api', { url: 'https://x' });
    expect(out.success).toBe(false);
    const data = out.data as {
      paymentConfirmed: boolean;
      paymentDigest: string;
      doNotRetry: boolean;
      warning: string;
    };
    expect(data.paymentConfirmed).toBe(true);
    expect(data.paymentDigest).toBe('0xpaymentdigest');
    expect(data.doNotRetry).toBe(true);
    expect(data.warning).toContain('$5');
  });
});

describe('executeToolAction — pay_api wraps SettleNoDeliveryError into free-retry shape (SPEC 26)', () => {
  it('returns success=false with paymentConfirmed=false + status=402 + settleVerdict + settleReason', async () => {
    const { SettleNoDeliveryError } = await import('./useAgent');

    const sdk = fakeAgent({
      payService: vi.fn().mockRejectedValue(
        new SettleNoDeliveryError(
          'OpenAI 400 — Invalid model',
          'refundable',
          'invalid model: dall-e-3',
          '0xpredigest',
        ),
      ),
    });

    const out = await executeToolAction(sdk, 'pay_api', {
      url: 'https://mpp.t2000.ai/openai/v1/images/generations',
    });

    // Top-level wrapper signals "tool ran but service NOT delivered + NOT charged".
    expect(out.success).toBe(false);

    const data = out.data as {
      success: boolean;
      error: string;
      status: number;
      paymentConfirmed: boolean;
      settleVerdict: string;
      settleReason: string;
      paymentDigest: string | null;
      serviceId?: string;
      hint: string;
    };
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid model');

    // The four fields the engine D-8 prompt depends on must be present.
    expect(data.status).toBe(402);
    expect(data.paymentConfirmed).toBe(false);
    expect(data.settleVerdict).toBe('refundable');
    expect(data.settleReason).toBe('invalid model: dall-e-3');

    // Bookkeeping handle for SPEC 26 O-4 deferred refund(digest) flow.
    expect(data.paymentDigest).toBe('0xpredigest');

    // serviceId derived from the URL so vendor-aware UI surfaces still resolve.
    expect(data.serviceId).toBe('openai/v1/images/generations');

    // Hint text is what the LLM reads to pick transient-vs-correctable.
    expect(data.hint).toContain('Free retry');
    expect(data.hint).toContain('settleReason');
  });

  it('preserves paymentDigest=null when the gateway response lacked one', async () => {
    const { SettleNoDeliveryError } = await import('./useAgent');

    const sdk = fakeAgent({
      payService: vi.fn().mockRejectedValue(
        new SettleNoDeliveryError('upstream 502', 'charge-failed', 'Sui rpc 503', null),
      ),
    });

    const out = await executeToolAction(sdk, 'pay_api', { url: 'https://mpp.t2000.ai/x/y' });
    const data = out.data as { paymentDigest: string | null; settleVerdict: string };
    expect(data.paymentDigest).toBeNull();
    expect(data.settleVerdict).toBe('charge-failed');
  });

  it('discriminates SettleNoDeliveryError BEFORE ServiceDeliveryError (no charge ≠ already charged)', async () => {
    // Regression guard: the catch order in executeToolAction matters.
    // SettleNoDeliveryError extends Error (not ServiceDeliveryError), so a
    // mis-ordered instanceof check would mis-route this into the
    // "paymentConfirmed: true, doNotRetry: true" branch — exactly the
    // wrong message to send the user / LLM.
    const { SettleNoDeliveryError } = await import('./useAgent');

    const sdk = fakeAgent({
      payService: vi.fn().mockRejectedValue(
        new SettleNoDeliveryError('upstream 400', 'refundable', 'invalid prompt', '0xdig'),
      ),
    });

    const out = await executeToolAction(sdk, 'pay_api', { url: 'https://mpp.t2000.ai/x/y' });
    const data = out.data as {
      paymentConfirmed: boolean;
      doNotRetry?: boolean;
      warning?: string;
    };
    // Must NOT be the doNotRetry branch's payload.
    expect(data.paymentConfirmed).toBe(false);
    expect(data.doNotRetry).toBeUndefined();
    expect(data.warning).toBeUndefined();
  });
});

describe('executeToolAction — volo_stake exposes vSuiReceived from balance changes', () => {
  it('returns vSuiReceived parsed from positive vSUI delta', async () => {
    const sdk = fakeAgent({
      stakeVSui: vi.fn().mockResolvedValue({
        tx: '0xstake',
        balanceChanges: [
          { coinType: SUI_TYPE, amount: '-10000000000' },     // -10 SUI
          { coinType: VSUI_TYPE, amount: '9800000000' },       // +9.8 vSUI
        ],
      }),
    });

    const out = await executeToolAction(sdk, 'volo_stake', { amount: 10 });
    expect(out.success).toBe(true);
    const data = out.data as { amount: number; vSuiReceived: number };
    expect(data.amount).toBe(10);
    expect(data.vSuiReceived).toBeCloseTo(9.8, 6);
  });
});

// [v0.55 Fix 3] Send-transfer recipient resolution order. Pre-fix, the only
// resolver was `effects.resolveContact`, so SuiNS-style inputs ("alex.sui")
// were passed through to the SDK which rejected them as malformed addresses.
// The LLM then confabulated "I tried that already, the SuiNS name couldn't
// be resolved" — see the bug report in audric-build-tracker.md S.49.
//
// New order: contact → SuiNS (async) → pass-through to SDK.
describe('executeToolAction — send_transfer SuiNS resolution', () => {
  const SEND_RESULT = {
    tx: '0xsenddigest',
    balanceChanges: [{ coinType: USDC_TYPE, amount: '-1000000' }],
  };

  it('resolves a SuiNS name via effects.resolveSuiNs when the contact lookup misses', async () => {
    const sendSpy = vi.fn().mockResolvedValue(SEND_RESULT);
    const sdk = fakeAgent({ send: sendSpy });
    const resolveSuiNs = vi.fn().mockResolvedValue('0xresolved');

    const out = await executeToolAction(
      sdk,
      'send_transfer',
      { to: 'alex.sui', amount: 1, asset: 'USDC' },
      {
        resolveContact: () => null,
        resolveSuiNs,
      },
    );

    expect(out.success).toBe(true);
    expect(resolveSuiNs).toHaveBeenCalledWith('alex.sui');
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: '0xresolved' }),
    );

    // [v0.56 receipt fix] The receipt card needs:
    //   - `to`         = on-chain 0x address (so isSuiAddress() passes and
    //                    the chunked-hex render fires)
    //   - `suinsName`  = the human-readable name the user typed (rendered as
    //                    the "To: funkii.sui" label above the chunked hex)
    //   - `contactName`= undefined (not a contact)
    // Pre-fix, `to: rawTo` left the receipt with a blank "To" row because
    // `isSuiAddress('alex.sui')` is false.
    const data = out.data as { to: string; suinsName?: string; contactName?: string };
    expect(data.to).toBe('0xresolved');
    expect(data.suinsName).toBe('alex.sui');
    expect(data.contactName).toBeUndefined();
  });

  it('skips SuiNS resolution when resolveContact returns a hit', async () => {
    const sendSpy = vi.fn().mockResolvedValue(SEND_RESULT);
    const sdk = fakeAgent({ send: sendSpy });
    const resolveSuiNs = vi.fn();

    const out = await executeToolAction(
      sdk,
      'send_transfer',
      { to: 'alex.sui', amount: 1, asset: 'USDC' },
      {
        resolveContact: () => '0xfromcontact',
        resolveSuiNs,
      },
    );

    expect(resolveSuiNs).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: '0xfromcontact' }),
    );

    // Contact-resolved sends populate `contactName` (not `suinsName`), even
    // when the typed string happens to look like a SuiNS name. The contact
    // takes precedence and the receipt should reflect that.
    const data = out.data as { to: string; suinsName?: string; contactName?: string };
    expect(data.to).toBe('0xfromcontact');
    expect(data.contactName).toBe('alex.sui');
    expect(data.suinsName).toBeUndefined();
  });

  it('skips SuiNS resolution when the input does not look like a SuiNS name', async () => {
    const sendSpy = vi.fn().mockResolvedValue(SEND_RESULT);
    const sdk = fakeAgent({ send: sendSpy });
    const resolveSuiNs = vi.fn();

    const out = await executeToolAction(
      sdk,
      'send_transfer',
      { to: '0xrawaddress', amount: 1, asset: 'USDC' },
      { resolveSuiNs },
    );

    expect(resolveSuiNs).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: '0xrawaddress' }),
    );

    // Pure 0x pass-through — neither display-name field set; `to` is the
    // raw address (which is also what was sent on-chain).
    const data = out.data as { to: string; suinsName?: string; contactName?: string };
    expect(data.to).toBe('0xrawaddress');
    expect(data.contactName).toBeUndefined();
    expect(data.suinsName).toBeUndefined();
  });

  it('propagates SuinsResolutionError up the stack so the LLM can narrate the truthful reason', async () => {
    const { SuinsResolutionError } = await import('@/lib/suins-resolver');
    const sendSpy = vi.fn();
    const sdk = fakeAgent({ send: sendSpy });
    const resolveSuiNs = vi.fn().mockRejectedValue(
      new SuinsResolutionError(
        'not_registered',
        '"alex.sui" is not a registered SuiNS name.',
        'alex.sui',
      ),
    );

    await expect(
      executeToolAction(
        sdk,
        'send_transfer',
        { to: 'alex.sui', amount: 1, asset: 'USDC' },
        { resolveContact: () => null, resolveSuiNs },
      ),
    ).rejects.toMatchObject({
      code: 'not_registered',
    });

    // SDK send was NEVER called — we don't waste an RPC round-trip on a
    // bad address.
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

// ─── SPEC 7 P2.4 Layer 3 — executeBundleAction ─────────────────────────────

describe('executeBundleAction — multi-write Payment Intent dispatch', () => {
  it('forwards minimal { toolName, input } step shape to sdk.executeBundle', async () => {
    const { executeBundleAction } = await import('./executeToolAction');
    const executeBundle = vi.fn().mockResolvedValue({ tx: '0xbundle' });
    const sdk = fakeAgent({ executeBundle });

    const action = {
      toolName: 'swap_execute',
      toolUseId: 'tool-use-1',
      input: { from: 'USDC', to: 'SUI', amount: 200 },
      description: 'bundle',
      assistantContent: [],
      turnIndex: 0,
      attemptId: 'attempt-step-1',
      steps: [
        {
          toolName: 'swap_execute',
          toolUseId: 'tool-use-1',
          attemptId: 'attempt-step-1',
          input: { from: 'USDC', to: 'SUI', amount: 200 },
          description: 'Swap 200 USDC → SUI',
        },
        {
          toolName: 'save_deposit',
          toolUseId: 'tool-use-2',
          attemptId: 'attempt-step-2',
          input: { amount: 900, asset: 'USDC' },
          description: 'Save 900 USDC',
        },
        {
          toolName: 'send_transfer',
          toolUseId: 'tool-use-3',
          attemptId: 'attempt-step-3',
          input: { amount: 100, to: '0xabc', asset: 'USDC' },
          description: 'Send 100 USDC',
        },
      ],
    } as never;

    const out = await executeBundleAction(sdk, action);

    expect(out.success).toBe(true);
    expect(out.txDigest).toBe('0xbundle');
    expect(out.stepResults).toHaveLength(3);

    // sdk.executeBundle must receive ONLY toolName + input (no
    // toolUseId / attemptId / description fields leak to the wire).
    expect(executeBundle).toHaveBeenCalledTimes(1);
    const passedSteps = executeBundle.mock.calls[0][0];
    expect(passedSteps).toEqual([
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 200 } },
      { toolName: 'save_deposit', input: { amount: 900, asset: 'USDC' } },
      { toolName: 'send_transfer', input: { amount: 100, to: '0xabc', asset: 'USDC' } },
    ]);
  });

  it('builds per-step results echoing input + shared tx digest on success', async () => {
    const { executeBundleAction } = await import('./executeToolAction');
    const sdk = fakeAgent({
      executeBundle: vi.fn().mockResolvedValue({ tx: '0xbundle' }),
    });

    const action = {
      toolName: 'save_deposit',
      toolUseId: 'tool-use-1',
      input: { amount: 100, asset: 'USDC' },
      description: '',
      assistantContent: [],
      turnIndex: 0,
      attemptId: 'a1',
      steps: [
        {
          toolName: 'save_deposit',
          toolUseId: 'tool-use-1',
          attemptId: 'a1',
          input: { amount: 100, asset: 'USDC' },
          description: 'Save 100 USDC',
        },
        {
          toolName: 'send_transfer',
          toolUseId: 'tool-use-2',
          attemptId: 'a2',
          input: { amount: 50, to: '0xdef', asset: 'USDC' },
          description: 'Send 50 USDC',
        },
      ],
    } as never;

    const out = await executeBundleAction(sdk, action);

    expect(out.stepResults[0]).toMatchObject({
      toolUseId: 'tool-use-1',
      attemptId: 'a1',
      isError: false,
      result: { success: true, tx: '0xbundle', amount: 100, asset: 'USDC' },
    });
    expect(out.stepResults[1]).toMatchObject({
      toolUseId: 'tool-use-2',
      attemptId: 'a2',
      isError: false,
      result: { success: true, tx: '0xbundle', amount: 50, to: '0xdef', asset: 'USDC' },
    });
  });

  it('on revert, marks every step as isError with same root cause (atomic semantics)', async () => {
    const { executeBundleAction } = await import('./executeToolAction');
    const sdk = fakeAgent({
      executeBundle: vi.fn().mockRejectedValue(new Error('Insufficient gas (sponsor revert)')),
    });

    const action = {
      toolName: 'save_deposit',
      toolUseId: 'tool-use-1',
      input: { amount: 100, asset: 'USDC' },
      description: '',
      assistantContent: [],
      turnIndex: 0,
      attemptId: 'a1',
      steps: [
        {
          toolName: 'save_deposit',
          toolUseId: 'tool-use-1',
          attemptId: 'a1',
          input: { amount: 100, asset: 'USDC' },
          description: '',
        },
        {
          toolName: 'send_transfer',
          toolUseId: 'tool-use-2',
          attemptId: 'a2',
          input: { amount: 50, to: '0xdef' },
          description: '',
        },
      ],
    } as never;

    const out = await executeBundleAction(sdk, action);

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Insufficient gas/);
    expect(out.txDigest).toBeUndefined();
    expect(out.stepResults).toHaveLength(2);
    for (const sr of out.stepResults) {
      expect(sr.isError).toBe(true);
      expect((sr.result as Record<string, unknown>)._bundleReverted).toBe(true);
      expect((sr.result as Record<string, unknown>).error).toMatch(/Insufficient gas/);
    }
  });

  // [Bug B fix / 2026-05-10] Production smoke 2026-05-10 (S.142) showed
  // the LLM narrating "Bundle executed. Swapped 5 USDC → SUI..." even
  // though every stepResult carried `isError: true` and
  // `_bundleReverted: true`. The system-prompt rule at
  // engine-context.ts:123 ("Failed write... means the tx did NOT
  // execute") got ignored. Fix: embed the narration directive INLINE
  // in the error string so it lives in the tool_result content the
  // LLM is asked to narrate from — much harder to ignore than an
  // abstract system-prompt rule. These tests pin the new error
  // format so a future "let's just use the raw error" refactor
  // doesn't regress the protection.
  it('on revert, error content contains the BUNDLE REVERTED narration directive (Bug B)', async () => {
    const { executeBundleAction } = await import('./executeToolAction');
    const sdk = fakeAgent({
      executeBundle: vi.fn().mockRejectedValue(new Error('Cannot use GasCoin as a transaction argument')),
    });
    const action = {
      toolName: 'save_deposit',
      toolUseId: 'tool-use-1',
      input: {},
      description: '',
      assistantContent: [],
      turnIndex: 0,
      attemptId: 'a1',
      steps: [
        {
          toolName: 'swap_execute',
          toolUseId: 't1',
          attemptId: 'a-t1',
          input: { from: 'USDC', to: 'SUI', amount: 5 },
          description: '',
        },
        {
          toolName: 'swap_execute',
          toolUseId: 't2',
          attemptId: 'a-t2',
          input: { from: 'USDC', to: 'GOLD', amount: 3 },
          description: '',
        },
        {
          toolName: 'save_deposit',
          toolUseId: 't3',
          attemptId: 'a-t3',
          input: { amount: 2, asset: 'USDC' },
          description: '',
        },
      ],
    } as never;

    const out = await executeBundleAction(sdk, action);

    expect(out.success).toBe(false);
    // Top-level out.error stays raw (used by UI for receipt rendering).
    expect(out.error).toBe('Cannot use GasCoin as a transaction argument');

    // Per-step result.error MUST be wrapped with the narration directive.
    // These exact phrases are the load-bearing anti-confabulation
    // instructions — assert each one explicitly so a refactor that
    // shortens the message can't silently drop them.
    expect(out.stepResults).toHaveLength(3);
    for (const sr of out.stepResults) {
      const wrappedError = (sr.result as Record<string, unknown>).error as string;
      expect(wrappedError).toContain('BUNDLE REVERTED — NOTHING EXECUTED ON-CHAIN');
      expect(wrappedError).toContain('Atomic Sui Payment Intent semantics');
      expect(wrappedError).toContain('Wallet balances are unchanged');
      // Echoes the underlying cause so users get the "why".
      expect(wrappedError).toContain('Cause: Cannot use GasCoin as a transaction argument');
      // Forbidden-phrase guards that previously got ignored as
      // system-prompt rules — embedding them inline catches more.
      expect(wrappedError).toContain('Do NOT claim ANY operation succeeded');
      expect(wrappedError).toContain('Do NOT say "settling"');
      // The marker the post-write-anchor walker keys on.
      expect((sr.result as Record<string, unknown>)._bundleReverted).toBe(true);
    }
  });

  it('buildBundleRevertedError exports the helper for cross-file reuse (UnifiedTimeline + tests)', async () => {
    const { buildBundleRevertedError } = await import('./executeToolAction');
    const out = buildBundleRevertedError('test cause');
    expect(out).toContain('BUNDLE REVERTED');
    expect(out).toContain('Cause: test cause');
    expect(out).toContain('Do NOT claim ANY operation succeeded');
  });

  it('throws when called with no steps (host-bug guard)', async () => {
    const { executeBundleAction } = await import('./executeToolAction');
    const sdk = fakeAgent({});

    const action = {
      toolName: 'save_deposit',
      toolUseId: 'tool-use-1',
      input: {},
      description: '',
      assistantContent: [],
      turnIndex: 0,
      attemptId: 'a1',
    } as never;

    await expect(executeBundleAction(sdk, action)).rejects.toThrow(/no steps/);
  });
});

describe('[S.122] EnokiSessionExpiredError → _sessionExpired sentinel', () => {
  it('single write: surfaces sessionExpired flag + _sessionExpired in data', async () => {
    const { EnokiSessionExpiredError } = await import('./useAgent');
    const sdk = fakeAgent({
      send: vi.fn().mockRejectedValue(
        new EnokiSessionExpiredError(
          'Your sign-in session has expired. Please sign back in to continue.',
          'prepare',
        ),
      ),
    });

    const out = await executeToolAction(sdk, 'send_transfer', {
      to: '0xdef',
      amount: 5,
      asset: 'USDC',
    });
    expect(out.success).toBe(false);
    expect(out.sessionExpired).toBe(true);
    const data = out.data as Record<string, unknown>;
    expect(data._sessionExpired).toBe(true);
    expect(data.error).toMatch(/sign-in session/i);
  });

  it('swap_execute: re-throws EnokiSessionExpiredError past the inner catch', async () => {
    // Regression for the swap_execute branch which has its own try/catch
    // that pre-fix would swallow EnokiSessionExpiredError into a generic
    // {success:false, data:{...}}. Rethrow guarantees the outer wrapper
    // emits the typed sentinel so the bundle/single UI renders the
    // re-auth state, not "swap failed: jwt_error".
    const { EnokiSessionExpiredError } = await import('./useAgent');
    const sdk = fakeAgent({
      swap: vi.fn().mockRejectedValue(
        new EnokiSessionExpiredError('session dead', 'prepare'),
      ),
    });

    const out = await executeToolAction(sdk, 'swap_execute', {
      from: 'USDC',
      to: 'SUI',
      amount: 10,
    });
    expect(out.sessionExpired).toBe(true);
    expect((out.data as Record<string, unknown>)._sessionExpired).toBe(true);
  });

  it('bundle: marks every leg with _sessionExpired and surfaces top-level sessionExpired', async () => {
    const { EnokiSessionExpiredError } = await import('./useAgent');
    const { executeBundleAction } = await import('./executeToolAction');

    const sdk = fakeAgent({
      executeBundle: vi.fn().mockRejectedValue(
        new EnokiSessionExpiredError('session dead', 'prepare'),
      ),
    });

    const action = {
      toolName: 'bundle',
      toolUseId: 'bundle-1',
      input: {},
      description: '',
      assistantContent: [],
      turnIndex: 0,
      attemptId: 'a1',
      steps: [
        {
          toolName: 'swap_execute',
          toolUseId: 't1',
          attemptId: 'a-t1',
          input: { from: 'USDC', to: 'USDsui', amount: 99.53 },
          description: 'Swap 99.53 USDC for USDsui',
        },
        {
          toolName: 'save_deposit',
          toolUseId: 't2',
          attemptId: 'a-t2',
          input: { amount: 99.4, asset: 'USDsui' },
          description: 'Save 99.4 USDsui into lending',
        },
      ],
    } as never;

    const out = await executeBundleAction(sdk, action);

    expect(out.success).toBe(false);
    expect(out.sessionExpired).toBe(true);
    expect(out.txDigest).toBeUndefined();
    expect(out.stepResults).toHaveLength(2);
    for (const sr of out.stepResults) {
      expect(sr.isError).toBe(true);
      const r = sr.result as Record<string, unknown>;
      expect(r._sessionExpired).toBe(true);
      // Critical: NOT _bundleReverted — this distinguishes the
      // session-expired path from on-chain reverts so the timeline
      // renderer surfaces the right framing.
      expect(r._bundleReverted).toBeUndefined();
    }
  });
});
