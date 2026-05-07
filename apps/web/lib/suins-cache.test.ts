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
  invalidateAndWarmSuins,
  invalidateRevokedSuins,
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

  it('caches negative resolutions for 10 seconds (shorter than positive — S18-F13 reduced from 30s)', async () => {
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
      10, // 10s — S18-F13 reduced from 30s to narrow the false-AVAILABLE bug window
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

describe('invalidateAndWarmSuins (S18-F13 — fixes false-AVAILABLE bug)', () => {
  beforeEach(() => {
    mocks.resolveSuinsViaRpc.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetSuinsCacheStore();
    vi.restoreAllMocks();
  });

  it('writes a fresh positive cache entry with the new address (5min TTL)', async () => {
    const trackingStore: SuinsCacheStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(trackingStore);

    await invalidateAndWarmSuins('funkii.audric.sui', '0xfreshlyminted');

    expect(trackingStore.set).toHaveBeenCalledWith(
      'funkii.audric.sui',
      expect.objectContaining({ result: '0xfreshlyminted' }),
      300, // 5min positive TTL
    );
  });

  it('overwrites a stale NEGATIVE cache entry with the new positive — the bug-fix scenario', async () => {
    // Simulate the actual bug: someone's earlier picker check populated a
    // negative cache entry for "funkii". Then the user reserves the handle.
    // After invalidateAndWarmSuins runs, the next picker check should see
    // POSITIVE (claimed) instead of stale NEGATIVE (available).
    const realStore: SuinsCacheStore = (() => {
      const map = new Map<string, { result: string | null; cachedAt: number }>();
      return {
        get: vi.fn(async (k: string) => map.get(k) ?? null),
        set: vi.fn(async (k: string, v: { result: string | null; cachedAt: number }) => {
          map.set(k, v);
        }),
        delete: vi.fn(async (k: string) => {
          map.delete(k);
        }),
        clear: vi.fn(async () => map.clear()),
      };
    })();
    setSuinsCacheStore(realStore);

    // Pre-bug-fix state: stale negative cached
    await realStore.set(
      'funkii.audric.sui',
      { result: null, cachedAt: Date.now() - 5_000 },
      10,
    );

    // User mints; route calls invalidateAndWarmSuins
    await invalidateAndWarmSuins('funkii.audric.sui', '0xnewowner');

    // Subsequent picker check sees the POSITIVE entry (no live RPC)
    const result = await resolveSuinsCached('funkii.audric.sui', {
      suiRpcUrl: 'https://x',
    });
    expect(result).toBe('0xnewowner');
    expect(mocks.resolveSuinsViaRpc).not.toHaveBeenCalled();
  });

  it('does NOT throw when store.set fails (best-effort)', async () => {
    const failingStore: SuinsCacheStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error('Upstash 500')),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(failingStore);

    await expect(
      invalidateAndWarmSuins('funkii.audric.sui', '0xnewowner'),
    ).resolves.toBeUndefined();
  });
});

describe('invalidateRevokedSuins (S18-F13 — change-handle path)', () => {
  beforeEach(() => {
    mocks.resolveSuinsViaRpc.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetSuinsCacheStore();
    vi.restoreAllMocks();
  });

  it('writes a fresh negative cache entry with 10s TTL', async () => {
    const trackingStore: SuinsCacheStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(trackingStore);

    await invalidateRevokedSuins('oldhandle.audric.sui');

    expect(trackingStore.set).toHaveBeenCalledWith(
      'oldhandle.audric.sui',
      expect.objectContaining({ result: null }),
      10, // 10s negative TTL
    );
  });

  it('does NOT throw when store.set fails (best-effort)', async () => {
    const failingStore: SuinsCacheStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error('Upstash 500')),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    setSuinsCacheStore(failingStore);

    await expect(
      invalidateRevokedSuins('oldhandle.audric.sui'),
    ).resolves.toBeUndefined();
  });
});
