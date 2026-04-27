import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __test_currentPrefixes,
  __test_isSyntheticWithCurrentEnv,
  isSyntheticSessionId,
  SYNTHETIC_SESSION_PREFIXES,
} from '../synthetic-sessions';

/**
 * [v1.4.2 — Day 3 / Spec Item 3] These tests cover both the env-snapshot
 * shape (locked at module load) and the env-derived helper used by tests
 * to override that snapshot. The production helper
 * `isSyntheticSessionId` is verified against the snapshot; everything
 * else uses `__test_isSyntheticWithCurrentEnv` to safely mutate
 * `process.env` without poisoning other suites.
 */
describe('synthetic-sessions', () => {
  describe('SYNTHETIC_SESSION_PREFIXES (module-load snapshot)', () => {
    it('exports an array (possibly empty) of strings', () => {
      expect(Array.isArray(SYNTHETIC_SESSION_PREFIXES)).toBe(true);
      for (const p of SYNTHETIC_SESSION_PREFIXES) {
        expect(typeof p).toBe('string');
        expect(p.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isSyntheticSessionId (production helper, snapshot-bound)', () => {
    it('matches the module-snapshot prefixes', () => {
      const sample = SYNTHETIC_SESSION_PREFIXES[0];
      if (sample) {
        expect(isSyntheticSessionId(`${sample}_xyz`)).toBe(true);
      }
      expect(isSyntheticSessionId('s_real_user_session_abcdef')).toBe(false);
    });

    it('returns false on a sessionId that no prefix matches', () => {
      expect(isSyntheticSessionId('completely-unrelated-id')).toBe(false);
    });
  });

  describe('env-driven derivation (test-only helpers)', () => {
    const originalEnv = process.env.SYNTHETIC_SESSION_PREFIXES;

    beforeEach(() => {
      delete process.env.SYNTHETIC_SESSION_PREFIXES;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SYNTHETIC_SESSION_PREFIXES;
      } else {
        process.env.SYNTHETIC_SESSION_PREFIXES = originalEnv;
      }
    });

    it('returns false for any sessionId when env is unset', () => {
      expect(__test_isSyntheticWithCurrentEnv('s_anything')).toBe(false);
      expect(__test_isSyntheticWithCurrentEnv('s_1777047351366_d172f3de05f0')).toBe(false);
    });

    it('returns false when env is empty string', () => {
      process.env.SYNTHETIC_SESSION_PREFIXES = '';
      expect(__test_isSyntheticWithCurrentEnv('s_anything')).toBe(false);
    });

    it('returns false when env is whitespace and commas only', () => {
      process.env.SYNTHETIC_SESSION_PREFIXES = ' , ,, ';
      expect(__test_currentPrefixes()).toEqual([]);
      expect(__test_isSyntheticWithCurrentEnv('s_anything')).toBe(false);
    });

    it('matches a single configured prefix exactly', () => {
      process.env.SYNTHETIC_SESSION_PREFIXES = 's_synthetic_';
      expect(__test_isSyntheticWithCurrentEnv('s_synthetic_abc')).toBe(true);
      expect(__test_isSyntheticWithCurrentEnv('s_real_abc')).toBe(false);
    });

    it('supports multiple comma-separated prefixes', () => {
      process.env.SYNTHETIC_SESSION_PREFIXES = 's_synthetic_,s_botcheck_';
      expect(__test_isSyntheticWithCurrentEnv('s_synthetic_x')).toBe(true);
      expect(__test_isSyntheticWithCurrentEnv('s_botcheck_y')).toBe(true);
      expect(__test_isSyntheticWithCurrentEnv('s_real_user')).toBe(false);
    });

    it('trims whitespace around prefixes', () => {
      process.env.SYNTHETIC_SESSION_PREFIXES = '  s_synthetic_  ,  s_botcheck_  ';
      expect(__test_currentPrefixes()).toEqual(['s_synthetic_', 's_botcheck_']);
      expect(__test_isSyntheticWithCurrentEnv('s_synthetic_x')).toBe(true);
    });

    it('matches the canonical bot session prefix from the v1.4.2 deploy SQL', () => {
      // [v1.4.2 — Day 3] The deploy SQL backfills `synthetic = true` for
      // sessionId `s_1777047351366_d172f3de05f0`. The going-forward
      // prefix that catches the same family of bot sessions is
      // `s_1777047351366` (timestamp prefix shared across all the bot's
      // sessions). Verifying both ensures the env-driven path replicates
      // the manual backfill for any new sessions the bot starts.
      process.env.SYNTHETIC_SESSION_PREFIXES = 's_1777047351366';
      expect(
        __test_isSyntheticWithCurrentEnv('s_1777047351366_d172f3de05f0'),
      ).toBe(true);
      expect(
        __test_isSyntheticWithCurrentEnv('s_1777047351366_anothersession'),
      ).toBe(true);
      expect(__test_isSyntheticWithCurrentEnv('s_1888888888888_x')).toBe(false);
    });

    it('does not match a prefix that appears mid-sessionId', () => {
      process.env.SYNTHETIC_SESSION_PREFIXES = 'bot_';
      expect(__test_isSyntheticWithCurrentEnv('s_bot_x')).toBe(false);
      expect(__test_isSyntheticWithCurrentEnv('bot_x')).toBe(true);
    });
  });
});
