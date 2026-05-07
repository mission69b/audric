import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSuinsViaRpc: vi.fn<(handle: string, opts: { suiRpcUrl: string }) => Promise<string | null>>(),
}));

vi.mock('@t2000/engine', async () => {
  const actual = await vi.importActual<typeof import('@t2000/engine')>('@t2000/engine');
  return {
    ...actual,
    resolveSuinsViaRpc: mocks.resolveSuinsViaRpc,
    SuinsRpcError: class SuinsRpcError extends Error {
      constructor(handle: string, detail: string) {
        super(`SuiNS lookup failed for "${handle}" (${detail}). Try again, or paste the full Sui address.`);
        this.name = 'SuinsRpcError';
      }
    },
  };
});

import {
  resolveSuinsCached,
  _resetSuinsCacheForTests,
  setSuinsCacheStore,
  resetSuinsCacheStore,
  SuinsRpcError,
  type SuinsCacheStore,
} from './suins-cache';

describe('resolveSuinsCached (default in-memory store)', () => {
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
    mocks.resolveSuinsViaRpc.mockResolvedValueOnce('0xaaa').mockResolvedValueOnce('0xbbb');

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

    const result = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });
    expect(result).toBe('0xrecovered');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(2);
  });
});

describe('resolveSuinsCached — degradation under cache failure (S18-F12)', () => {
  beforeEach(() => {
    mocks.resolveSuinsViaRpc.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetSuinsCacheStore();
    vi.restoreAllMocks();
  });

  it('falls through to live RPC when store.get throws (cache infra down)', async () => {
    const failingStore: SuinsCacheStore = {
      get: vi.fn().mockRejectedValue(new Error('Upstash 503')),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(failingStore);
    mocks.resolveSuinsViaRpc.mockResolvedValueOnce('0xfallback');

    const result = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });

    expect(result).toBe('0xfallback');
    expect(mocks.resolveSuinsViaRpc).toHaveBeenCalledTimes(1);
    expect(failingStore.set).toHaveBeenCalledTimes(1);
  });

  it('returns the live RPC result when store.set throws (does NOT propagate)', async () => {
    const partiallyFailingStore: SuinsCacheStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error('Upstash write timeout')),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(partiallyFailingStore);
    mocks.resolveSuinsViaRpc.mockResolvedValueOnce('0xok');

    const result = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });

    expect(result).toBe('0xok');
    expect(partiallyFailingStore.set).toHaveBeenCalledTimes(1);
  });

  it('uses correct TTL for positive vs negative entries (asserted via store.set call)', async () => {
    const trackingStore: SuinsCacheStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(trackingStore);
    mocks.resolveSuinsViaRpc
      .mockResolvedValueOnce('0xabc') // positive
      .mockResolvedValueOnce(null); // negative

    await resolveSuinsCached('a.audric.sui', { suiRpcUrl: 'https://x' });
    await resolveSuinsCached('b.audric.sui', { suiRpcUrl: 'https://x' });

    expect(trackingStore.set).toHaveBeenNthCalledWith(
      1,
      'a.audric.sui',
      expect.objectContaining({ result: '0xabc' }),
      300, // 5 min
    );
    expect(trackingStore.set).toHaveBeenNthCalledWith(
      2,
      'b.audric.sui',
      expect.objectContaining({ result: null }),
      30, // 30s
    );
  });

  it('reads cached value (no live RPC) when store returns a hit', async () => {
    const hitStore: SuinsCacheStore = {
      get: vi.fn().mockResolvedValue({ result: '0xcached', cachedAt: Date.now() }),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(hitStore);

    const result = await resolveSuinsCached('test.audric.sui', { suiRpcUrl: 'https://x' });

    expect(result).toBe('0xcached');
    expect(mocks.resolveSuinsViaRpc).not.toHaveBeenCalled();
    expect(hitStore.set).not.toHaveBeenCalled();
  });
});
