// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.3 — interactive-harness helpers
//
// Pure-function tests for the helpers backing per-session flag pinning.
// `isInteractiveHarnessEnabled()` reads from the env-validation gate,
// which `vi.mock` lets us swap deterministically.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock `@/lib/env` because `interactive-harness.ts` imports it
// directly. Setting a value on `mockEnv` BEFORE the module-under-test is
// imported (or re-imported) drives both `isInteractiveHarnessEnabled()`
// and `currentHarnessVersion()`.
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

describe('isInteractiveHarnessEnabled', () => {
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

describe('currentHarnessVersion', () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    vi.resetModules();
  });

  it('returns "v2" when the flag is on, "legacy" otherwise', async () => {
    const { currentHarnessVersion } = await import('@/lib/interactive-harness');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    expect(currentHarnessVersion()).toBe('v2');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = 'true';
    expect(currentHarnessVersion()).toBe('v2');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '0';
    expect(currentHarnessVersion()).toBe('legacy');

    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    expect(currentHarnessVersion()).toBe('legacy');
  });
});
