import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @t2000/engine BEFORE importing suins-cache so the module under test
// picks up the mocked function. Using vi.hoisted so the mock object is
// created before vi.mock processes the factory.
const mocks = vi.hoisted(() => ({
  resolveSuinsViaRpc: vi.fn<(handle: string, opts: { suiRpcUrl: string }) => Promise<string | null>>(),
}));

vi.mock('@t2000/engine', () => ({
  resolveSuinsViaRpc: mocks.resolveSuinsViaRpc,
  SuinsRpcError: class SuinsRpcError extends Error {
    constructor(handle: string, detail: string) {
      super(`SuiNS lookup failed for "${handle}" (${detail}). Try again, or paste the full Sui address.`);
      this.name = 'SuinsRpcError';
    }
  },
}));

import { resolveSuinsCached, _resetSuinsCacheForTests, SuinsRpcError } from './suins-cache';

describe('resolveSuinsCached', () => {
  beforeEach(() => {
    _resetSuinsCacheForTests();
    mocks.resolveSuinsViaRpc.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caches positive resolutions for 5 minutes', async () => {
    mocks.resolveSuinsViaRpc.mockResolvedValueOnce('0xabc123');

    const a = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });
    const b = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });
    const c = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });

    expect(a).toBe('0xabc123');
    expect(b).toBe('0xabc123');
    expect(c).toBe('0xabc123');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(1);
  });

  it('caches negative resolutions for 30 seconds (shorter than positive)', async () => {
    mocks.resolveSuinsViaRpc.mockResolvedValueOnce(null);

    const a = await resolveSuinsCached('nope.audric.sui', { suiRpcUrl: 'https://x' });
    const b = await resolveSuinsCached('nope.audric.sui', { suiRpcUrl: 'https://x' });

    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(1);
  });

  it('returns different results for different handles (no key collision)', async () => {
    mocks.resolveSuinsViaRpc
      .mockResolvedValueOnce('0xaaa')
      .mockResolvedValueOnce('0xbbb');

    const a = await resolveSuinsCached('alice.audric.sui', { suiRpcUrl: 'https://x' });
    const b = await resolveSuinsCached('bob.audric.sui', { suiRpcUrl: 'https://x' });

    expect(a).toBe('0xaaa');
    expect(b).toBe('0xbbb');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache errors — re-fetches on next call', async () => {
    mocks.resolveSuinsViaRpc
      .mockRejectedValueOnce(new SuinsRpcError('test.audric.sui', 'HTTP 429'))
      .mockResolvedValueOnce('0xrecovered');

    await expect(resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' })).rejects.toThrow(
      'HTTP 429',
    );

    // Second call re-fetches — error was NOT cached.
    const result = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });
    expect(result).toBe('0xrecovered');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(2);
  });

  it('expires positive entries after 5 minutes', async () => {
    mocks.resolveSuinsViaRpc
      .mockResolvedValueOnce('0xfirst')
      .mockResolvedValueOnce('0xsecond');

    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValue(1_000_000);

    const a = await resolveSuinsCached('expiry-test.audric.sui', { suiRpcUrl: 'https://x' });
    expect(a).toBe('0xfirst');

    // 4:59 later — still cached.
    dateNow.mockReturnValue(1_000_000 + (4 * 60 + 59) * 1000);
    const b = await resolveSuinsCached('expiry-test.audric.sui', { suiRpcUrl: 'https://x' });
    expect(b).toBe('0xfirst');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(1);

    // 5:01 later — expired, re-fetch.
    dateNow.mockReturnValue(1_000_000 + (5 * 60 + 1) * 1000);
    const c = await resolveSuinsCached('expiry-test.audric.sui', { suiRpcUrl: 'https://x' });
    expect(c).toBe('0xsecond');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(2);
  });

  it('expires negative entries after 30 seconds (much shorter than positive)', async () => {
    mocks.resolveSuinsViaRpc
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('0xnewlyminted');

    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValue(2_000_000);

    const a = await resolveSuinsCached('newhandle.audric.sui', { suiRpcUrl: 'https://x' });
    expect(a).toBeNull();

    // 29s later — still cached.
    dateNow.mockReturnValue(2_000_000 + 29_000);
    const b = await resolveSuinsCached('newhandle.audric.sui', { suiRpcUrl: 'https://x' });
    expect(b).toBeNull();
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(1);

    // 31s later — expired, re-fetch picks up the newly-minted handle.
    dateNow.mockReturnValue(2_000_000 + 31_000);
    const c = await resolveSuinsCached('newhandle.audric.sui', { suiRpcUrl: 'https://x' });
    expect(c).toBe('0xnewlyminted');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(2);
  });
});
