import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_AGE_GATE_DAYS,
  applyAccountAgeGate,
  computeAccountAgeDays,
} from './account-age-gate';
import { DEFAULT_PERMISSION_CONFIG, PERMISSION_PRESETS, resolvePermissionTier } from '@t2000/engine';

describe('account-age-gate (SPEC 30 D-13)', () => {
  describe('ACCOUNT_AGE_GATE_DAYS', () => {
    it('is 7 days per SPEC 30 D-13 lock', () => {
      expect(ACCOUNT_AGE_GATE_DAYS).toBe(7);
    });
  });

  describe('computeAccountAgeDays', () => {
    it('returns null for null/undefined', () => {
      expect(computeAccountAgeDays(null)).toBeNull();
      expect(computeAccountAgeDays(undefined)).toBeNull();
    });

    it('returns null for invalid date string', () => {
      expect(computeAccountAgeDays('not-a-date')).toBeNull();
    });

    it('floors fractional days', () => {
      const sixPointNineDaysAgo = new Date(Date.now() - 6.9 * 86_400_000);
      expect(computeAccountAgeDays(sixPointNineDaysAgo)).toBe(6);
    });

    it('returns 0 for an account created right now', () => {
      const now = new Date();
      expect(computeAccountAgeDays(now)).toBe(0);
    });

    it('returns 7 for an account created exactly 7 days ago', () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
      expect(computeAccountAgeDays(sevenDaysAgo)).toBe(7);
    });

    it('accepts ISO strings (typical Prisma serialization)', () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      expect(computeAccountAgeDays(sevenDaysAgo)).toBe(7);
    });
  });

  describe('applyAccountAgeGate', () => {
    it('passes through unchanged when accountAgeDays === null (legacy fail-open)', () => {
      const result = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, null);
      expect(result).toBe(DEFAULT_PERMISSION_CONFIG);
    });

    it('passes through unchanged when accountAgeDays >= 7', () => {
      expect(applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 7)).toBe(DEFAULT_PERMISSION_CONFIG);
      expect(applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 30)).toBe(DEFAULT_PERMISSION_CONFIG);
      expect(applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 365)).toBe(DEFAULT_PERMISSION_CONFIG);
    });

    it('zeros every autoBelow when accountAgeDays < 7', () => {
      const gated = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 0);
      expect(gated.globalAutoBelow).toBe(0);
      for (const rule of gated.rules) {
        expect(rule.autoBelow).toBe(0);
      }
    });

    it('preserves confirmBetween in the gated config', () => {
      const gated = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 3);
      const saveRule = gated.rules.find((r) => r.operation === 'save');
      expect(saveRule?.confirmBetween).toBe(1000);
      const sendRule = gated.rules.find((r) => r.operation === 'send');
      expect(sendRule?.confirmBetween).toBe(200);
    });

    it('preserves autonomousDailyLimit in the gated config', () => {
      const gated = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 3);
      expect(gated.autonomousDailyLimit).toBe(DEFAULT_PERMISSION_CONFIG.autonomousDailyLimit);
    });

    it('does not mutate the input config', () => {
      const before = JSON.parse(JSON.stringify(DEFAULT_PERMISSION_CONFIG));
      applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 0);
      expect(DEFAULT_PERMISSION_CONFIG).toEqual(before);
    });

    it('works on every preset (conservative / balanced / aggressive)', () => {
      for (const [name, config] of Object.entries(PERMISSION_PRESETS)) {
        const gated = applyAccountAgeGate(config, 0);
        expect(gated.globalAutoBelow, `${name}.globalAutoBelow`).toBe(0);
        for (const rule of gated.rules) {
          expect(rule.autoBelow, `${name}.${rule.operation}.autoBelow`).toBe(0);
        }
      }
    });
  });

  describe('integration with resolvePermissionTier', () => {
    it('Day 0: a small USDC save resolves to confirm (was auto on balanced)', () => {
      const ungated = resolvePermissionTier('save', 10, DEFAULT_PERMISSION_CONFIG);
      expect(ungated).toBe('auto');

      const gated = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 0);
      const tier = resolvePermissionTier('save', 10, gated);
      expect(tier).toBe('confirm');
    });

    it('Day 0: a $1 send resolves to confirm (was auto on balanced)', () => {
      const ungated = resolvePermissionTier('send', 1, DEFAULT_PERMISSION_CONFIG);
      expect(ungated).toBe('auto');

      const gated = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 0);
      const tier = resolvePermissionTier('send', 1, gated);
      expect(tier).toBe('confirm');
    });

    it('Day 7: gate disengages — small writes auto-execute again', () => {
      const config = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 7);
      expect(resolvePermissionTier('save', 10, config)).toBe('auto');
      expect(resolvePermissionTier('send', 1, config)).toBe('auto');
    });

    it('Day 0: high-USD writes still tier to confirm or explicit (gate does not relax those)', () => {
      const gated = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, 0);
      expect(resolvePermissionTier('save', 100, gated)).toBe('confirm');
      expect(resolvePermissionTier('save', 1500, gated)).toBe('explicit');
    });

    it('Day 0: borrow stays confirm regardless of gate (autoBelow already 0 in every preset)', () => {
      const gated = applyAccountAgeGate(PERMISSION_PRESETS.aggressive, 0);
      expect(resolvePermissionTier('borrow', 50, gated)).toBe('confirm');
    });

    it('legacy fail-open: null age preserves existing auto-tier behaviour', () => {
      const config = applyAccountAgeGate(DEFAULT_PERMISSION_CONFIG, null);
      expect(resolvePermissionTier('save', 10, config)).toBe('auto');
    });
  });
});
