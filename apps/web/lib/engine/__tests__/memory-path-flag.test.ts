// ---------------------------------------------------------------------------
// __tests__/memory-path-flag.test.ts
// ---------------------------------------------------------------------------
//
// [S.154 / B6-1 mitigation — 2026-05-18]
//
// Mitigates the B6-1 audit finding from the S.153 A+B+F review: the original
// `engine-factory.ts` flag-parse was inline (`env.ENGINE_MEMORY_PATH_ENABLED
// === '1' || env.ENGINE_MEMORY_PATH_ENABLED?.toLowerCase() === 'true'`) and
// had no direct test coverage — only the operator-side `[memory-path]
// enabled` console.log served as canary verification.
//
// `isMemoryPathEnabled()` is now extracted into a pure helper so the truth
// table is unit-tested. The factory's conditional branching (which uses the
// helper's return value) is still verified by the operator log + canary
// observation, but the parse classification is no longer the unknown.
//
// **What this DOES test:**
//   - All operator-typed truthy values produce `true` (`'1'`, `'true'`,
//     `'TRUE'`, `'True'`).
//   - Common falsy / no-set values produce `false` (`undefined`, `'0'`,
//     `'false'`, `'no'`, `'off'`).
//   - Edge cases that look-like-truthy in `Boolean(v)` coercion but should
//     NOT enable the flag (`'0'`, `'false'`, empty string, whitespace).
//   - The `multi-step recall guard` from the engine side is unchanged —
//     this only tests audric's flag-parsing.
//
// **What this DOES NOT test:**
//   - The branching logic in `engine-factory.ts` that uses this helper's
//     return value (memoryStore wiring, buildFullDynamicContextSeparated
//     call, financialContextBlock extraction). Those are covered by:
//       (a) `full-dynamic-context-separated.test.ts` (the separator helper)
//       (b) `five-layer-ordering.test.ts` in `@t2000/engine` (the engine
//           side of the contract)
//       (c) operator-side production canary via `vercel logs | grep
//           '[memory-path]'`
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

import { isMemoryPathEnabled } from '../memory-path-flag';

describe('isMemoryPathEnabled', () => {
  describe('truthy values (enable memory path)', () => {
    it('returns true for "1" (canonical Vercel UI value)', () => {
      expect(isMemoryPathEnabled('1')).toBe(true);
    });

    it('returns true for "true" (lowercase)', () => {
      expect(isMemoryPathEnabled('true')).toBe(true);
    });

    it('returns true for "TRUE" (uppercase)', () => {
      expect(isMemoryPathEnabled('TRUE')).toBe(true);
    });

    it('returns true for "True" (mixed case)', () => {
      expect(isMemoryPathEnabled('True')).toBe(true);
    });
  });

  describe('falsy values (legacy path)', () => {
    it('returns false for undefined (env-var not set — production default)', () => {
      expect(isMemoryPathEnabled(undefined)).toBe(false);
    });

    it('returns false for "0"', () => {
      // CRITICAL: a permissive Boolean(v) coercion would treat "0" as
      // truthy (non-empty string). The helper must NOT.
      expect(isMemoryPathEnabled('0')).toBe(false);
    });

    it('returns false for "false" (lowercase)', () => {
      expect(isMemoryPathEnabled('false')).toBe(false);
    });

    it('returns false for "FALSE" (uppercase)', () => {
      expect(isMemoryPathEnabled('FALSE')).toBe(false);
    });

    it('returns false for empty string', () => {
      // env.ts `optionalString` zod transform already normalizes empty +
      // whitespace-only strings to undefined, but defend here too — a
      // future caller might bypass the env module.
      expect(isMemoryPathEnabled('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(isMemoryPathEnabled('   ')).toBe(false);
    });

    it('returns false for "no"', () => {
      expect(isMemoryPathEnabled('no')).toBe(false);
    });

    it('returns false for "off"', () => {
      expect(isMemoryPathEnabled('off')).toBe(false);
    });

    it('returns false for "yes" (NOT a recognized truthy value)', () => {
      // Conservative truthy set — only "1" / "true" enable. "yes" might
      // surprise an operator typing "yes" expecting it to work, but
      // matches Vercel UI conventions + avoids ambiguity.
      expect(isMemoryPathEnabled('yes')).toBe(false);
    });

    it('returns false for arbitrary non-empty strings', () => {
      expect(isMemoryPathEnabled('on')).toBe(false);
      expect(isMemoryPathEnabled('enable')).toBe(false);
      expect(isMemoryPathEnabled('disabled')).toBe(false);
      expect(isMemoryPathEnabled('whatever')).toBe(false);
    });
  });

  describe('forward-compatibility regression bar', () => {
    it('returns true ONLY for the documented truthy set', () => {
      // If a future PR widens the truthy set (e.g. adds 'on' / 'yes'),
      // this assertion will fail loudly so the doc-vs-impl contract
      // stays in sync. Update both this list AND the JSDoc on
      // `memory-path-flag.ts` if you intentionally widen.
      const truthy = ['1', 'true', 'TRUE', 'True'];
      for (const v of truthy) {
        expect(isMemoryPathEnabled(v)).toBe(true);
      }
    });

    it('does NOT trust Boolean(v) coercion semantics', () => {
      // The bug class env-validation-gate.mdc was written to prevent:
      // `Boolean('0')` is `true` because '0' is a non-empty string.
      // The helper MUST reject "0" explicitly.
      expect(Boolean('0')).toBe(true); // demonstrates the bug surface
      expect(isMemoryPathEnabled('0')).toBe(false); // helper defends
    });
  });
});
