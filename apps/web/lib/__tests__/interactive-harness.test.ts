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
  NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT: undefined as string | undefined,
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
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = undefined;
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

// ---------------------------------------------------------------------------
// [SPEC 8 v0.5.1 B3.7] Graduated rollout — bucket helpers + percentage gate
// ---------------------------------------------------------------------------

describe('rolloutPercent', () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = undefined;
    vi.resetModules();
  });

  it('returns null when the env var is unset / empty / non-numeric', async () => {
    const { rolloutPercent } = await import('@/lib/interactive-harness');
    for (const v of [undefined, '', '   ', 'abc', 'NaN']) {
      mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = v;
      expect(rolloutPercent()).toBeNull();
    }
  });

  it('clamps to [0, 100]', async () => {
    const { rolloutPercent } = await import('@/lib/interactive-harness');
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '-50';
    expect(rolloutPercent()).toBe(0);
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '0';
    expect(rolloutPercent()).toBe(0);
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '50';
    expect(rolloutPercent()).toBe(50);
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '100';
    expect(rolloutPercent()).toBe(100);
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '500';
    expect(rolloutPercent()).toBe(100);
  });

  it('rejects fractional / partial / scientific-notation strings (audit polish)', async () => {
    const { rolloutPercent } = await import('@/lib/interactive-harness');
    // Strict integer-only parse: anything that isn't exactly /^-?\d+$/
    // returns null. This catches founder typos like '50abc' or '10.7'
    // (treated as 50/10 by Number.parseInt, masking the typo).
    for (const v of ['10.7', '50abc', '5e2', '0x10', ' 50 abc', '+50']) {
      mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = v;
      expect(rolloutPercent()).toBeNull();
    }
  });
});

describe('bucketFor (FNV-1a hash mod 100)', () => {
  it('produces values in [0, 99] for arbitrary inputs', async () => {
    const { bucketFor } = await import('@/lib/interactive-harness');
    for (const s of [
      '',
      '0x40cd0eebfca60ce18c97f96cc69b3edd13ce8d3e62',
      'funkii',
      '🪪 emoji edge case',
      's_1714568943_abc',
    ]) {
      const b = bucketFor(s);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(99);
    }
  });

  it('is deterministic — same input always produces same bucket', async () => {
    const { bucketFor } = await import('@/lib/interactive-harness');
    const addr = '0x40cd0eebfca60ce18c97f96cc69b3edd13ce8d3e62';
    expect(bucketFor(addr)).toBe(bucketFor(addr));
    expect(bucketFor(addr)).toBe(bucketFor(addr)); // 2nd call too
  });

  it('different inputs typically produce different buckets (sanity, not a guarantee)', async () => {
    const { bucketFor } = await import('@/lib/interactive-harness');
    // Sample 1000 distinct inputs; verify the bucket distribution covers
    // ≥80 of the 100 buckets (FNV-1a is uniform enough — any massive
    // collision means our choice of hash is broken).
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      seen.add(bucketFor(`addr-${i}`));
    }
    expect(seen.size).toBeGreaterThanOrEqual(80);
  });
});

describe('currentHarnessVersion — with rollout percentage gate (B3.7)', () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = undefined;
    vi.resetModules();
  });

  it('flag-off + any percent → always legacy', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '50';
    const { currentHarnessVersion } = await import('@/lib/interactive-harness');
    expect(currentHarnessVersion()).toBe('legacy');
    expect(currentHarnessVersion('any-key')).toBe('legacy');
  });

  it('flag-on + no percent gate → admit every bucket (today\'s behavior)', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = undefined;
    const { currentHarnessVersion } = await import('@/lib/interactive-harness');
    expect(currentHarnessVersion()).toBe('v2');
    expect(currentHarnessVersion('addr-1')).toBe('v2');
    expect(currentHarnessVersion('addr-2')).toBe('v2');
  });

  it('flag-on + percent=0 → never admit (rollback path)', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '0';
    const { currentHarnessVersion } = await import('@/lib/interactive-harness');
    expect(currentHarnessVersion('addr-1')).toBe('legacy');
    expect(currentHarnessVersion('addr-2')).toBe('legacy');
  });

  it('flag-on + percent=100 → admit every bucket', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '100';
    const { currentHarnessVersion } = await import('@/lib/interactive-harness');
    for (let i = 0; i < 100; i++) {
      expect(currentHarnessVersion(`addr-${i}`)).toBe('v2');
    }
  });

  it('flag-on + percent active + missing bucketKey → legacy (conservative)', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '50';
    const { currentHarnessVersion } = await import('@/lib/interactive-harness');
    expect(currentHarnessVersion()).toBe('legacy');
    expect(currentHarnessVersion(undefined)).toBe('legacy');
  });

  it('admits the lower percent% slice deterministically (10% rollout → ~10/100 keys)', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = '10';
    const { currentHarnessVersion, bucketFor } = await import('@/lib/interactive-harness');

    // Sample 1000 keys; count how many land in v2.
    let v2Count = 0;
    for (let i = 0; i < 1000; i++) {
      if (currentHarnessVersion(`addr-${i}`) === 'v2') v2Count++;
    }
    // 10% ± 3% on a 1000-sample uniform hash. Wider tolerance because
    // FNV-1a isn't a CSPRNG and short prefixes can cluster.
    expect(v2Count).toBeGreaterThanOrEqual(70);
    expect(v2Count).toBeLessThanOrEqual(130);

    // Also verify: the SAME admitted key stays admitted across calls.
    const admitted = `addr-${Array.from({ length: 1000 }, (_, i) => i).find(
      (i) => bucketFor(`addr-${i}`) < 10,
    )}`;
    expect(currentHarnessVersion(admitted)).toBe('v2');
    expect(currentHarnessVersion(admitted)).toBe('v2');
  });

  it('a single user always lands in the same bucket across env-var changes', async () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    const addr = '0x40cd0eebfca60ce18c97f96cc69b3edd13ce8d3e62';
    const { bucketFor, currentHarnessVersion } = await import('@/lib/interactive-harness');

    const bucket = bucketFor(addr);

    // Same user, every percent setting:
    for (const p of ['10', '50', '100']) {
      mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = p;
      const expected = bucket < Number(p) ? 'v2' : 'legacy';
      expect(currentHarnessVersion(addr)).toBe(expected);
    }
  });
});
