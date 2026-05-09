import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const counterSpy = vi.fn();
const histogramSpy = vi.fn();
const gaugeSpy = vi.fn();

vi.mock('@t2000/engine', () => ({
  getTelemetrySink: () => ({
    counter: counterSpy,
    histogram: histogramSpy,
    gauge: gaugeSpy,
  }),
}));

import { withSuiRetry, isTransientSuiError } from './sui-retry';

describe('isTransientSuiError', () => {
  it('matches Sui RPC 429 ("Unexpected status code: 429")', () => {
    expect(isTransientSuiError(new Error('Unexpected status code: 429'))).toBe(true);
  });

  it('matches SuiNS HTTP 429', () => {
    expect(isTransientSuiError(new Error('SuiNS lookup failed for "x.audric.sui" (HTTP 429)'))).toBe(true);
  });

  it('matches shared-object stale-version contention', () => {
    expect(
      isTransientSuiError(
        new Error(
          'Transaction is rejected as invalid by more than 1/3 of validators by stake (non-retriable). Non-retriable errors: [Transaction needs to be rebuilt because object 0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198 version 0x33bc2098 is unavailable for consumption, current version: 0x33bc2099]',
        ),
      ),
    ).toBe(true);
  });

  it('matches shared-object lock contention', () => {
    expect(
      isTransientSuiError(
        new Error(
          'Transaction is rejected as invalid by more than 1/3 of validators by stake (non-retriable). Non-retriable errors: [Object (0x07045..., SequenceNumber(867265961)) already locked by a different transaction]',
        ),
      ),
    ).toBe(true);
  });

  it('matches network blips (ECONNRESET, HeadersTimeoutError, fetch failed)', () => {
    expect(isTransientSuiError(new Error('read ECONNRESET'))).toBe(true);
    expect(isTransientSuiError(new Error('HeadersTimeoutError'))).toBe(true);
    expect(isTransientSuiError(new Error('TypeError: fetch failed'))).toBe(true);
  });

  it('does NOT match user-input validation errors', () => {
    expect(isTransientSuiError(new Error('Invalid address'))).toBe(false);
    expect(isTransientSuiError(new Error('Username already claimed on-chain'))).toBe(false);
  });

  it('does NOT match on-chain reverts (Move abort, insufficient balance, etc.)', () => {
    expect(isTransientSuiError(new Error('Move abort: 4'))).toBe(false);
    expect(isTransientSuiError(new Error('Insufficient gas'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientSuiError('string')).toBe(false);
    expect(isTransientSuiError(undefined)).toBe(false);
    expect(isTransientSuiError(null)).toBe(false);
    expect(isTransientSuiError({ message: 'looks like an error' })).toBe(false);
  });

  it('matches errors with transient cause via .cause.message', () => {
    const err = new Error('TypeError: fetch failed');
    (err as { cause?: unknown }).cause = new Error('read ECONNRESET');
    expect(isTransientSuiError(err)).toBe(true);
  });

  it('matches validator equivocation rejection (S18-F17 — observed in May 7 burst-50)', () => {
    expect(
      isTransientSuiError(
        new Error(
          'Failed to mint leaf: Transaction is rejected as invalid by more than 1/3 of validators by stake (non-retriable). Non-retriable errors: [Equivocation detected on shared object 0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198]',
        ),
      ),
    ).toBe(true);
  });

  it('matches "equivocated" string', () => {
    expect(isTransientSuiError(new Error('the transaction equivocated'))).toBe(true);
  });
});

describe('withSuiRetry', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof globalThis.setTimeout>;
    }) as typeof globalThis.setTimeout);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    counterSpy.mockClear();
    histogramSpy.mockClear();
    gaugeSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately on first-attempt success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withSuiRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to 5 times by default on transient errors (S18-F17 bumped from 3)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unexpected status code: 429'))
      .mockRejectedValueOnce(new Error('Unexpected status code: 429'))
      .mockResolvedValueOnce('ok');
    const result = await withSuiRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rethrows the last transient error after all 5 attempts fail (S18-F17)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Unexpected status code: 429'));
    await expect(withSuiRetry(fn)).rejects.toThrow('Unexpected status code: 429');
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('does NOT retry non-transient errors (re-throws on first attempt)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Username already claimed'));
    await expect(withSuiRetry(fn)).rejects.toThrow('Username already claimed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects custom attempts option', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 429'));
    await expect(withSuiRetry(fn, { attempts: 2 })).rejects.toThrow('HTTP 429');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('emits a labeled warn on each retry (no warn on success first try)', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce('ok');
    await withSuiRetry(fn, { label: 'reserve:mint' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[sui-retry:reserve:mint]');
    expect(warnSpy.mock.calls[0][0]).toContain('attempt 1/5');
  });

  it('mixes transient + non-transient correctly (rethrows immediately on non-transient)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockRejectedValueOnce(new Error('Insufficient gas'));
    await expect(withSuiRetry(fn)).rejects.toThrow('Insufficient gas');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// [SPEC 19 Phase F / S.135] external.retry_count telemetry
describe('withSuiRetry — external.retry_count telemetry', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof globalThis.setTimeout>;
    }) as typeof globalThis.setTimeout);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    counterSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits first_try outcome on immediate success (attempts=1)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await withSuiRetry(fn);
    expect(counterSpy).toHaveBeenCalledWith('external.retry_count', {
      vendor: 'sui',
      outcome: 'first_try',
      attempts: '1',
    });
  });

  it('emits retried_success outcome when recovered after retries (attempts=N)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce('ok');
    await withSuiRetry(fn);
    expect(counterSpy).toHaveBeenCalledWith('external.retry_count', {
      vendor: 'sui',
      outcome: 'retried_success',
      attempts: '3',
    });
  });

  it('emits exhausted outcome when all transient attempts fail (attempts=5)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 429'));
    await expect(withSuiRetry(fn)).rejects.toThrow();
    expect(counterSpy).toHaveBeenCalledWith('external.retry_count', {
      vendor: 'sui',
      outcome: 'exhausted',
      attempts: '5',
    });
  });

  it('emits first_try outcome when non-transient error fails on first attempt (no retry done)', async () => {
    // A non-transient error means the layer correctly chose NOT to retry —
    // no retries were burned, so outcome=first_try (semantic: the layer's
    // retry intent was not exercised). The error itself surfaces to the
    // caller and is observable via console.warn / Vercel error logs.
    const fn = vi.fn().mockRejectedValue(new Error('Insufficient gas'));
    await expect(withSuiRetry(fn)).rejects.toThrow();
    expect(counterSpy).toHaveBeenCalledWith('external.retry_count', {
      vendor: 'sui',
      outcome: 'first_try',
      attempts: '1',
    });
  });

  it('emits exactly once per call (no double-emission)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce('ok');
    await withSuiRetry(fn);
    const retryCallCount = counterSpy.mock.calls.filter(
      ([name]) => name === 'external.retry_count',
    ).length;
    expect(retryCallCount).toBe(1);
  });
});
