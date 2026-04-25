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
