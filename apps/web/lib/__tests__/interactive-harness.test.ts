// ───────────────────────────────────────────────────────────────────────────
// SPEC 23A-P0 (2026-05-11) — interactive-harness helpers (post-rip)
//
// Pure-function tests for the surviving helpers. The pre-rip rollout
// machinery (`rolloutPercent`, `bucketFor`, percentage-gated
// `currentHarnessVersion`) was deleted along with its tests. What
// remains is the symbolic kill-switch (`isInteractiveHarnessEnabled`),
// the narrowing guard (`asHarnessVersion`), and the `currentHarnessVersion`
// stub returning `'v2'` unconditionally.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock `@/lib/env` because `interactive-harness.ts` imports it
// directly. Setting a value on `mockEnv` BEFORE the module-under-test is
// imported (or re-imported) drives `isInteractiveHarnessEnabled()`.
const mockEnv = {
  NEXT_PUBLIC_INTERACTIVE_HARNESS: undefined as string | undefined,
};

vi.mock('@/lib/env', () => ({
  get env() {
    return mockEnv;
  },
}));

describe('asHarnessVersion', () => {
  it('returns the value when it matches a known harness version', async () => {
    const { asHarnessVersion } = await import('@/lib/interactive-harness');
    expect(asHarnessVersion('v2')).toBe('v2');
    // 'legacy' deserialises through the guard for one cycle so the
    // defensive auto-flip in the chat/sessions routes can flip it.
    expect(asHarnessVersion('legacy')).toBe('legacy');
  });

  it('returns undefined for unknown / malformed values (never coerces)', async () => {
    const { asHarnessVersion } = await import('@/lib/interactive-harness');
    expect(asHarnessVersion('')).toBeUndefined();
    expect(asHarnessVersion(undefined)).toBeUndefined();
    expect(asHarnessVersion(null)).toBeUndefined();
    expect(asHarnessVersion('V2')).toBeUndefined(); // case-sensitive on purpose
    expect(asHarnessVersion('default')).toBeUndefined();
    expect(asHarnessVersion(1)).toBeUndefined();
    expect(asHarnessVersion({ version: 'v2' })).toBeUndefined();
  });
});

describe('isInteractiveHarnessEnabled (symbolic kill-switch, post-SPEC-23A-P0)', () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    vi.resetModules();
  });

  it('returns false when env-var is unset', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    const { isInteractiveHarnessEnabled } = await import('@/lib/interactive-harness');
    expect(isInteractiveHarnessEnabled()).toBe(false);
  });

  it('returns false for empty string and irrelevant values', async () => {
    const { isInteractiveHarnessEnabled } = await import('@/lib/interactive-harness');
    for (const v of ['', '0', 'false', 'no', 'off', 'enable']) {
      mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = v;
      expect(isInteractiveHarnessEnabled()).toBe(false);
    }
  });

  it('returns true for "1" and "true" (case-insensitive, with surrounding whitespace)', async () => {
    const { isInteractiveHarnessEnabled } = await import('@/lib/interactive-harness');
    for (const v of ['1', 'true', 'TRUE', ' true ', 'True']) {
      mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = v;
      expect(isInteractiveHarnessEnabled()).toBe(true);
    }
  });
});

describe('currentHarnessVersion (post-SPEC-23A-P0 stub)', () => {
  it('always returns "v2", regardless of env-var or bucket key', async () => {
    const { currentHarnessVersion } = await import('@/lib/interactive-harness');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    expect(currentHarnessVersion()).toBe('v2');
    expect(currentHarnessVersion('any-key')).toBe('v2');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = 'true';
    expect(currentHarnessVersion()).toBe('v2');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '0';
    expect(currentHarnessVersion()).toBe('v2');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    expect(currentHarnessVersion()).toBe('v2');

    // Bucket key is preserved on the stub for call-site compatibility
    // but ignored — used to deterministically slice users into v2 vs
    // legacy when the rollout-percent dial was active. Post-rip, every
    // bucket lands on v2.
    expect(currentHarnessVersion('0xabc...')).toBe('v2');
    expect(currentHarnessVersion('s_1234_xyz')).toBe('v2');
  });
});
