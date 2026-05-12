import { describe, expect, it } from 'vitest';
import {
  PERMISSION_PRESETS,
  getPresetConfig,
  isKnownContactAddress,
  resolvePermissionTier,
  resolveUsdValue,
  shouldClientAutoApprove,
  toolNameToOperation,
} from './permission-tiers-client';

/**
 * The client mirror MUST stay in lockstep with the engine's
 * `permission-rules.ts`. These tests pin the threshold semantics that
 * `<UnifiedTimeline>` and `<ChatMessage>` rely on. If they break, the
 * engine constants likely drifted — refresh the mirror.
 */

const PRICES = new Map<string, number>([
  ['USDC', 1],
  ['USDT', 1],
  ['SUI', 4],
]);

describe('resolvePermissionTier (client mirror)', () => {
  const cfg = PERMISSION_PRESETS.balanced;

  it('save under threshold → auto', () => {
    expect(resolvePermissionTier('save', 10, cfg)).toBe('auto');
    expect(resolvePermissionTier('save', 49.99, cfg)).toBe('auto');
  });

  it('save at/over threshold → confirm', () => {
    expect(resolvePermissionTier('save', 50, cfg)).toBe('confirm');
    expect(resolvePermissionTier('save', 51, cfg)).toBe('confirm');
    expect(resolvePermissionTier('save', 999, cfg)).toBe('confirm');
  });

  it('save above confirmBetween → explicit', () => {
    expect(resolvePermissionTier('save', 1000, cfg)).toBe('explicit');
    expect(resolvePermissionTier('save', 5000, cfg)).toBe('explicit');
  });

  it('downgrades auto → confirm when sessionSpend would breach daily cap', () => {
    expect(resolvePermissionTier('save', 40, cfg, 0)).toBe('auto');
    expect(resolvePermissionTier('save', 40, cfg, 161)).toBe('confirm');
  });
});

describe('resolveUsdValue (client mirror)', () => {
  it('USDC writes are valued 1:1', () => {
    expect(resolveUsdValue('save_deposit', { amount: 50 }, PRICES)).toBe(50);
    expect(resolveUsdValue('withdraw', { amount: 25 }, PRICES)).toBe(25);
    expect(resolveUsdValue('repay_debt', { amount: 12 }, PRICES)).toBe(12);
    expect(resolveUsdValue('borrow', { amount: 100 }, PRICES)).toBe(100);
  });

  it('USDC sends bypass priceCache', () => {
    expect(resolveUsdValue('send_transfer', { amount: 5, asset: 'USDC' }, PRICES)).toBe(5);
  });

  it('SUI transfers multiply by SUI price', () => {
    expect(resolveUsdValue('send_transfer', { amount: 2, asset: 'SUI' }, PRICES)).toBe(8);
  });

  it('volo writes price SUI', () => {
    expect(resolveUsdValue('volo_stake', { amount: 3 }, PRICES)).toBe(12);
    expect(resolveUsdValue('volo_unstake', { amount: 1 }, PRICES)).toBe(4);
  });

  it('missing prices fail safe (Infinity → upgrades tier)', () => {
    expect(
      resolveUsdValue('send_transfer', { amount: 1, asset: 'WAL' }, PRICES),
    ).toBe(Infinity);
  });

  // [SPEC 23B-MPP6-fastpath audit / 2026-05-12] Pin field-name parity
  // with the engine. Pre-fix this read `maxCost ?? price`; both fields
  // are absent from the pay_api schema (which declares `maxPrice`) so
  // resolution always returned 0 → tier=auto regardless of preset, AND
  // session-spend incrementing was a no-op. Post-fix honors `maxPrice`.
  it('pay_api honors maxPrice when set (matches pay_api schema)', () => {
    expect(resolveUsdValue('pay_api', { maxPrice: 2 }, PRICES)).toBe(2);
  });

  it('pay_api returns 0 when maxPrice is omitted (the common case — gateway price is the truth)', () => {
    expect(resolveUsdValue('pay_api', { url: 'https://example.com' }, PRICES)).toBe(0);
  });

  it('pay_api does NOT honor legacy maxCost typo', () => {
    expect(resolveUsdValue('pay_api', { maxCost: 2 }, PRICES)).toBe(0);
  });
});

describe('shouldClientAutoApprove', () => {
  const cfg = PERMISSION_PRESETS.balanced;

  it('auto-approves non-financial writes (claim_rewards)', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'claim_rewards', input: {} },
        cfg,
        0,
        PRICES,
      ),
    ).toBe(true);
  });

  it('does NOT special-case save_contact at the client gate', () => {
    // The audric override executes save_contact server-side with
    // `permissionLevel: 'auto'`, so the engine never yields a
    // pending_action for it and this gate is never consulted. If
    // save_contact ever DOES reach this gate it falls through to the
    // generic resolver — which has no operation mapping for it and
    // therefore returns false (forces a confirmation card). That's
    // safer than silently auto-approving a tool we no longer manage
    // here. See `lib/engine/contact-tools.ts`.
    expect(
      shouldClientAutoApprove(
        { toolName: 'save_contact', input: { name: 'a', address: 'b' } },
        cfg,
        0,
        PRICES,
      ),
    ).toBe(false);
  });

  it('reproduces the bug repro: balanced + $50 save → no auto', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'save_deposit', input: { amount: 50 } },
        cfg,
        0,
        PRICES,
      ),
    ).toBe(false);
    expect(
      shouldClientAutoApprove(
        { toolName: 'save_deposit', input: { amount: 51 } },
        cfg,
        0,
        PRICES,
      ),
    ).toBe(false);
  });

  it('auto-approves small balanced saves (≤ $50)', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'save_deposit', input: { amount: 10 } },
        cfg,
        0,
        PRICES,
      ),
    ).toBe(true);
  });

  it('agentBudget fast path overrides preset for tiny writes', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'send_transfer', input: { amount: 25, asset: 'USDC' } },
        cfg,
        0,
        PRICES,
        50,
      ),
    ).toBe(true);
  });

  it('daily cap downgrades small auto writes once breached', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'save_deposit', input: { amount: 40 } },
        cfg,
        180,
        PRICES,
      ),
    ).toBe(false);
  });

  it('unknown write tool is not auto-approved', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'mystery_write', input: {} },
        cfg,
        0,
        PRICES,
      ),
    ).toBe(false);
  });

  // ------------------------------------------------------------------
  // Send-safety gate (the lost-funds regression)
  // ------------------------------------------------------------------
  const KNOWN =
    '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd';
  const TYPO =
    '0x231455f0e9805bdd0345981463daf0346310a7b3b04a733b011cc791feb896cd';
  const contacts = [{ name: 'main', address: KNOWN }];

  it('send to raw 0x with no contact match → never auto, even if tiny', () => {
    expect(
      shouldClientAutoApprove(
        {
          toolName: 'send_transfer',
          input: { to: TYPO, amount: 0.01, asset: 'USDC' },
        },
        cfg,
        0,
        PRICES,
        0,
        contacts,
      ),
    ).toBe(false);
  });

  it('send to raw 0x with no contact match → not even agentBudget bypasses', () => {
    expect(
      shouldClientAutoApprove(
        {
          toolName: 'send_transfer',
          input: { to: TYPO, amount: 5, asset: 'USDC' },
        },
        cfg,
        0,
        PRICES,
        100,
        contacts,
      ),
    ).toBe(false);
  });

  it('send to a saved contact under threshold → auto', () => {
    expect(
      shouldClientAutoApprove(
        {
          toolName: 'send_transfer',
          input: { to: KNOWN, amount: 5, asset: 'USDC' },
        },
        cfg,
        0,
        PRICES,
        0,
        contacts,
      ),
    ).toBe(true);
  });

  it('send to a saved contact still confirms above tier threshold', () => {
    expect(
      shouldClientAutoApprove(
        {
          toolName: 'send_transfer',
          input: { to: KNOWN, amount: 50, asset: 'USDC' },
        },
        cfg,
        0,
        PRICES,
        0,
        contacts,
      ),
    ).toBe(false);
  });

  it('regression: send by contact NAME (e.g. "main") under threshold → auto', () => {
    // Repros the v0.46.15 production bug: user saved wallet1, then said
    // "send 1 SUI to wallet1", LLM passed `to: "wallet1"` (the name,
    // not the address). The send-safety check inside resolvePermissionTier
    // ran `isKnownContactAddress("wallet1", contacts)` which compared
    // the name against contact *addresses* and returned false, demoting
    // tier auto → confirm. Fix: only enforce the unknown-contact rule
    // when `to.startsWith('0x')` (raw addresses are the dangerous case).
    expect(
      shouldClientAutoApprove(
        {
          toolName: 'send_transfer',
          input: { to: 'main', amount: 5, asset: 'USDC' },
        },
        cfg,
        0,
        PRICES,
        0,
        contacts,
      ),
    ).toBe(true);
  });
});

describe('isKnownContactAddress', () => {
  const KNOWN =
    '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd';
  const TYPO =
    '0x231455f0e9805bdd0345981463daf0346310a7b3b04a733b011cc791feb896cd';
  const contacts = [{ address: KNOWN }];

  it('matches case-insensitively', () => {
    expect(isKnownContactAddress(KNOWN.toUpperCase().replace('0X', '0x'), contacts)).toBe(true);
  });

  it('rejects a one-character typo (the lost-funds case)', () => {
    expect(isKnownContactAddress(TYPO, contacts)).toBe(false);
  });
});

describe('preset & tool helpers', () => {
  it('getPresetConfig falls back to balanced on bad input', () => {
    expect(getPresetConfig(undefined)).toBe(PERMISSION_PRESETS.balanced);
    expect(getPresetConfig(null)).toBe(PERMISSION_PRESETS.balanced);
    // @ts-expect-error invalid preset name
    expect(getPresetConfig('weird')).toBe(PERMISSION_PRESETS.balanced);
    expect(getPresetConfig('aggressive')).toBe(PERMISSION_PRESETS.aggressive);
  });

  it('toolNameToOperation matches the engine map', () => {
    expect(toolNameToOperation('save_deposit')).toBe('save');
    expect(toolNameToOperation('withdraw')).toBe('withdraw');
    expect(toolNameToOperation('volo_stake')).toBe('save');
    expect(toolNameToOperation('claim_rewards')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// [F14 / 2026-05-03] Bundle-aware shouldClientAutoApprove
//
// Bug A regression: the gate iterates `action.steps[]` for bundles and
// returns `false` (renders the PermissionCard) if ANY leg resolves to
// confirm/explicit. Pre-F14 the gate only inspected step[0] which let
// bundles with mixed-tier legs silently auto-execute — the production
// repro was a 6-op bundle where step[0]=`repay $2` (auto) bypassed the
// confirm card while step[5]=`borrow $1` should have forced confirm.
//
// Bug B regression: aggressive preset's `borrow.autoBelow` is now `0`
// (was `10`) — borrow ALWAYS confirms across every preset regardless
// of amount, matching the engine's documented invariant in
// `t2000/.cursor/rules/safeguards-defense-in-depth.mdc`.
// ─────────────────────────────────────────────────────────────────────

describe('shouldClientAutoApprove — bundles (F14)', () => {
  const balanced = PERMISSION_PRESETS.balanced;
  const aggressive = PERMISSION_PRESETS.aggressive;

  type Step = {
    toolName: string;
    toolUseId: string;
    attemptId: string;
    input: Record<string, unknown>;
    description: string;
  };

  const stepRepay: Step = {
    toolName: 'repay_debt',
    toolUseId: 'tu_1',
    attemptId: 'a_1',
    input: { amount: 2.006, asset: 'USDsui' },
    description: 'Repay 2.006 USDsui debt',
  };
  const stepSwapSmall: Step = {
    toolName: 'swap_execute',
    toolUseId: 'tu_2',
    attemptId: 'a_2',
    input: { fromAmount: 2, fromAsset: 'USDC', toAsset: 'SUI' },
    description: 'Swap 2 USDC → SUI',
  };
  const stepSwapMid: Step = {
    toolName: 'swap_execute',
    toolUseId: 'tu_3',
    attemptId: 'a_3',
    input: { fromAmount: 5, fromAsset: 'USDC', toAsset: 'USDsui' },
    description: 'Swap 5 USDC → USDsui',
  };
  const stepSaveSmall: Step = {
    toolName: 'save_deposit',
    toolUseId: 'tu_4',
    attemptId: 'a_4',
    input: { amount: 9.98, asset: 'USDsui' },
    description: 'Save 9.98 USDsui',
  };
  const stepBorrow: Step = {
    toolName: 'borrow',
    toolUseId: 'tu_5',
    attemptId: 'a_5',
    input: { amount: 1, asset: 'USDsui' },
    description: 'Borrow 1 USDsui',
  };
  const stepSendContact: Step = {
    toolName: 'send_transfer',
    toolUseId: 'tu_6',
    attemptId: 'a_6',
    input: { to: 'funkii', amount: 1, asset: 'SUI' },
    description: 'Send 1 SUI to funkii',
  };

  const buildBundle = (
    steps: Step[],
  ): Pick<
    import('@/lib/engine-types').PendingAction,
    'toolName' | 'input' | 'steps'
  > => ({
    // Bundle top-level mirrors steps[0] per SPEC 7 P2.3.
    toolName: steps[0].toolName,
    input: steps[0].input,
    steps,
  });

  // ──────────────────────────────────────────────────────────────────
  // The exact production repro: 6-op bundle on aggressive preset.
  // ──────────────────────────────────────────────────────────────────
  it('production repro: 6-op bundle on aggressive preset shows card (because borrow leg)', () => {
    const bundle = buildBundle([
      stepRepay,
      stepSwapSmall,
      stepSwapMid,
      stepSaveSmall,
      stepBorrow,
      stepSendContact,
    ]);
    expect(
      shouldClientAutoApprove(bundle, aggressive, 0, PRICES, 0, [
        { address: 'funkii' },
      ]),
    ).toBe(false);
  });

  it('bundle with ANY borrow leg surfaces card on every preset (Bug B invariant)', () => {
    const bundle = buildBundle([stepRepay, stepBorrow]);
    for (const preset of [
      PERMISSION_PRESETS.conservative,
      PERMISSION_PRESETS.balanced,
      PERMISSION_PRESETS.aggressive,
    ]) {
      expect(shouldClientAutoApprove(bundle, preset, 0, PRICES, 0, [])).toBe(false);
    }
  });

  it('bundle with ALL legs auto-tier on aggressive auto-approves (no card)', () => {
    // Bundle of 2 small swaps + a small save — none is a borrow, all
    // legs under aggressive's autoBelow thresholds. SHOULD auto-approve.
    const bundle = buildBundle([stepSwapSmall, stepSwapMid, stepSaveSmall]);
    expect(shouldClientAutoApprove(bundle, aggressive, 0, PRICES, 0, [])).toBe(true);
  });

  it('bundle with ONE explicit-tier leg surfaces card', () => {
    const stepHugeSwap: Step = {
      ...stepSwapSmall,
      input: { fromAmount: 600, fromAsset: 'USDC', toAsset: 'SUI' },
      description: 'Swap 600 USDC → SUI',
    };
    const bundle = buildBundle([stepSwapSmall, stepHugeSwap]);
    expect(shouldClientAutoApprove(bundle, aggressive, 0, PRICES, 0, [])).toBe(false);
  });

  it('bundle with raw-0x send to unknown recipient surfaces card', () => {
    const stepSendStranger: Step = {
      toolName: 'send_transfer',
      toolUseId: 'tu_x',
      attemptId: 'a_x',
      input: {
        to: '0xdeadbeef0000000000000000000000000000000000000000000000000000beef',
        amount: 0.01,
        asset: 'USDC',
      },
      description: 'Send 0.01 USDC to stranger',
    };
    // All legs would otherwise be auto on aggressive.
    const bundle = buildBundle([stepSwapSmall, stepSendStranger]);
    expect(shouldClientAutoApprove(bundle, aggressive, 0, PRICES, 0, [])).toBe(false);
  });

  it('single-write semantics unchanged: balanced + $50 save → no auto', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'save_deposit', input: { amount: 50 } },
        balanced,
        0,
        PRICES,
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [F14 / 2026-05-03] Aggressive preset borrow rule MUST be autoBelow:0
// across the client mirror. Locks the invariant against drift between
// the engine and host (the engine tests have the matching guard).
// ─────────────────────────────────────────────────────────────────────

describe('aggressive preset (F14)', () => {
  it('borrow.autoBelow is 0 across every preset (debt is non-auto)', () => {
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      const borrowRule = config.rules.find((r) => r.operation === 'borrow');
      expect(
        borrowRule,
        `${presetName} preset must define an explicit borrow rule`,
      ).toBeDefined();
      expect(
        borrowRule!.autoBelow,
        `${presetName} preset must have borrow.autoBelow === 0`,
      ).toBe(0);
    }
  });

  it('aggressive borrow $1 NEVER auto-approves (was the F14 production bug)', () => {
    expect(
      shouldClientAutoApprove(
        { toolName: 'borrow', input: { amount: 1, asset: 'USDsui' } },
        PERMISSION_PRESETS.aggressive,
        0,
        PRICES,
      ),
    ).toBe(false);
  });
});
