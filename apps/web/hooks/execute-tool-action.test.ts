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
    swap: vi.fn(),
    stakeVSui: vi.fn(),
    unstakeVSui: vi.fn(),
    payService: vi.fn(),
    retryServiceDelivery: vi.fn(),
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
