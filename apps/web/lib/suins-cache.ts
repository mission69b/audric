import { resolveSuinsViaRpc, SuinsRpcError, getTelemetrySink } from '@t2000/engine';
import { Redis } from '@upstash/redis';

/**
 * Cross-Lambda cache for SuiNS handle → address resolution.
 *
 * ## Why this exists (S18-F9 — May 2026, Upstash-promoted in S18-F12)
 *
 * Original problem (S18-F9, vercel-logs L8): one popular profile
 * (`adeniyi.audric.sui`) was hit 77 times in 12h on `/[username]/page.tsx`
 * server renders. Each hit was a fresh `resolveSuinsViaRpc` call →
 * periodic 429 bursts → page intermittently 404'd its own visitors.
 *
 * The S18-F9 fix shipped a per-Lambda in-memory cache that solved the
 * problem at observed scale (~30 DAU) but had a known ceiling: at
 * 100-1000 DAU with autoscaling spinning up many concurrent Lambda
 * containers, each cold container's first request still hits live RPC.
 * S18-F12 promotes the cache to Upstash so the entire fleet shares one
 * authoritative cache — cold Lambdas hit a warm Redis entry instead of
 * a live RPC.
 *
 * ## Cache policy (unchanged from S18-F9)
 *
 * - Positive entries (handle → address): cached for {@link POSITIVE_TTL_SEC}.
 *   SuiNS leaf resolutions are stable on the order of days unless the user
 *   explicitly revokes / re-mints, so a 5-minute window is conservative.
 *
 * - Negative entries (handle → null, "not found"): cached for
 *   {@link NEGATIVE_TTL_SEC}. Shorter window so a newly-minted handle
 *   appears within ~30s of mint, without forcing a deploy. Tradeoff: the
 *   `/api/identity/reserve` route can't synchronously invalidate the cache
 *   for the new handle, but the 30s ceiling means any visitor hitting the
 *   page before then sees a 404 → reload → resolves. Acceptable UX.
 *
 * - Error entries (RPC threw): NOT cached. The caller treats them like
 *   `null`, but on the next request we'll re-attempt the lookup (in case
 *   it was a transient blip). Caching errors would mask real outages.
 *
 * ## Store pattern
 *
 * Mirrors the existing `upstash-tx-history-cache.ts` / `upstash-wallet-
 * cache.ts` / `upstash-defi-cache.ts` pattern: a `SuinsCacheStore`
 * interface with two implementations (Upstash for production, in-memory
 * for tests), plus a module-level injection slot wired by
 * `init-engine-stores.ts`.
 */

const POSITIVE_TTL_SEC = 5 * 60; // 5 minutes
const NEGATIVE_TTL_SEC = 30; // 30 seconds
const PREFIX = 'suins:';

interface CacheEntry {
  /** Resolved address, or `null` for "checked, no leaf". */
  result: string | null;
  /** ms timestamp when the entry was cached. */
  cachedAt: number;
}

/**
 * Pluggable interface so tests inject in-memory and production injects
 * Upstash. Same shape as `TxHistoryCacheStore` / `WalletCacheStore`.
 */
export interface SuinsCacheStore {
  get(handle: string): Promise<CacheEntry | null>;
  set(handle: string, entry: CacheEntry, ttlSec: number): Promise<void>;
  delete(handle: string): Promise<void>;
  clear(): Promise<void>;
}

export class UpstashSuinsCacheStore implements SuinsCacheStore {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(opts?: { redis?: Redis; prefix?: string }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
    this.prefix = opts?.prefix ?? PREFIX;
  }

  private k(handle: string): string {
    return `${this.prefix}${handle}`;
  }

  async get(handle: string): Promise<CacheEntry | null> {
    getTelemetrySink().counter('upstash.requests', { op: 'get', prefix: PREFIX });
    const value = await this.redis.get<CacheEntry>(this.k(handle));
    return value ?? null;
  }

  async set(handle: string, entry: CacheEntry, ttlSec: number): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'set', prefix: PREFIX });
    await this.redis.set(this.k(handle), entry, { ex: ttlSec });
  }

  async delete(handle: string): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'del', prefix: PREFIX });
    await this.redis.del(this.k(handle));
  }

  async clear(): Promise<void> {
    let cursor: string | number = 0;
    do {
      getTelemetrySink().counter('upstash.requests', { op: 'scan', prefix: PREFIX });
      const result: [string | number, string[]] = await this.redis.scan(cursor, {
        match: `${this.prefix}*`,
        count: 100,
      });
      const [next, keys] = result;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      cursor = next;
    } while (cursor !== 0 && cursor !== '0');
  }
}

class InMemorySuinsCacheStore implements SuinsCacheStore {
  private readonly map = new Map<string, { entry: CacheEntry; expiry: number }>();

  async get(handle: string): Promise<CacheEntry | null> {
    const hit = this.map.get(handle);
    if (!hit) return null;
    if (hit.expiry < Date.now()) {
      this.map.delete(handle);
      return null;
    }
    return hit.entry;
  }

  async set(handle: string, entry: CacheEntry, ttlSec: number): Promise<void> {
    this.map.set(handle, { entry, expiry: Date.now() + ttlSec * 1000 });
  }

  async delete(handle: string): Promise<void> {
    this.map.delete(handle);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}

let activeStore: SuinsCacheStore = new InMemorySuinsCacheStore();

export function setSuinsCacheStore(store: SuinsCacheStore): void {
  activeStore = store;
}

export function getSuinsCacheStore(): SuinsCacheStore {
  return activeStore;
}

export function resetSuinsCacheStore(): void {
  activeStore = new InMemorySuinsCacheStore();
}

/**
 * Cached wrapper around `resolveSuinsViaRpc`. Same signature except the
 * caller can distinguish "checked, no leaf" (`null`) from "RPC threw"
 * (propagates the SuinsRpcError).
 *
 * Cache miss path:
 *   1. Try the active store (Upstash in prod).
 *   2. On miss/expiry → live RPC.
 *   3. Stash result in the store with TTL based on positive/negative.
 *   4. On RPC throw → propagate, do NOT cache the failure.
 *
 * The store-level `get()` failure (e.g. Upstash down) degrades to a cache
 * miss — we log + fall through to the live RPC. The cache is purely
 * additive; we never want it to BREAK reads that would otherwise succeed.
 */
export async function resolveSuinsCached(
  handle: string,
  opts: { suiRpcUrl: string },
): Promise<string | null> {
  const store = getSuinsCacheStore();

  let cached: CacheEntry | null = null;
  try {
    cached = await store.get(handle);
  } catch (err) {
    // Cache infrastructure failure — log + continue as cache miss. NEVER
    // surface as a user-facing failure; the live RPC below is authoritative.
    console.warn(
      `[suins-cache] store.get failed for "${handle}", falling through to live RPC:`,
      err instanceof Error ? err.message : err,
    );
  }

  if (cached) {
    return cached.result;
  }

  // Live RPC — propagate errors so the caller can render an appropriate
  // error state (matches uncached behavior).
  const result = await resolveSuinsViaRpc(handle, { suiRpcUrl: opts.suiRpcUrl });

  // Best-effort write — same degradation policy as get(). A failed write
  // means the next request will re-RPC, but never breaks the current one.
  try {
    await store.set(
      handle,
      { result, cachedAt: Date.now() },
      result === null ? NEGATIVE_TTL_SEC : POSITIVE_TTL_SEC,
    );
  } catch (err) {
    console.warn(
      `[suins-cache] store.set failed for "${handle}":`,
      err instanceof Error ? err.message : err,
    );
  }

  return result;
}

/**
 * Test-only: clear the in-memory cache. Production code should NOT call
 * this — use the store interface directly if you need targeted invalidation.
 */
export function _resetSuinsCacheForTests(): void {
  resetSuinsCacheStore();
}

export { SuinsRpcError };
