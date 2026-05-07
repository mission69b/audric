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
// [S18-F13 — May 2026] Negative TTL reduced from 30s → 10s after the
// false-AVAILABLE picker bug surfaced (May 7 2026 founder report). The
// 30s window was the primary contributor to "picker says available, but
// reserve fails with 409" inconsistency:
//
//   T+0s   user A's picker check `funkii.audric.sui` → null cached 30s
//   T+5s   user A actually claims, OR funkii was already on-chain (orphan)
//   T+5s   user B's picker check → cache hit (stale null) → "AVAILABLE"
//   T+30s  cache entry expires
//   T+31s  user B re-checks (or different VU) → live RPC → real address
//          → "ALREADY CLAIMED" (the inconsistency in the bug screenshots)
//
// Lowering to 10s narrows the bug window 3x. Combined with the
// invalidateAndWarmSuins() write-through (called from reserve + change
// routes on successful mint), most real-world inconsistencies are
// eliminated. The remaining 10s window only affects orphan handles
// (on-chain leaves that audric's reserve flow never wrote to DB) where
// we have no write-side hook to invalidate.
const NEGATIVE_TTL_SEC = 10;
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
 * Write-through cache update for the freshly-minted positive resolution.
 *
 * Call this from any route that just MUTATED on-chain SuiNS state for a
 * given handle (currently /api/identity/reserve and /api/identity/change).
 *
 * Why write-through (not just delete)
 * -----------------------------------
 * After a successful mint, three things compete:
 *   1. The picker may have just cached a NEGATIVE entry for `handle` (NTL
 *      is short but non-zero). Without invalidation, the next picker
 *      check reads the stale null → renders "AVAILABLE" (false).
 *   2. The /<username> public page render for the freshly-claimed handle
 *      will hit live RPC on first visit. With write-through, it's a cache
 *      hit immediately.
 *   3. The next picker check from ANY user (typing the same name in their
 *      "is this taken?" debounce) gets the correct positive answer with
 *      zero RPC cost.
 *
 * Pure delete-on-mint would solve (1) but force the next reader to hit
 * live RPC. Write-through covers all three at the cost of one extra
 * Upstash SET (~10ms).
 *
 * Failure mode: best-effort. A failed write-through means the next reader
 * pays for one live RPC call (the cache simply degrades to its uncached
 * behaviour for that handle). Never throws.
 */
export async function invalidateAndWarmSuins(
  handle: string,
  newAddress: string,
): Promise<void> {
  try {
    await getSuinsCacheStore().set(
      handle,
      { result: newAddress, cachedAt: Date.now() },
      POSITIVE_TTL_SEC,
    );
  } catch (err) {
    console.warn(
      `[suins-cache] write-through warm-up failed for "${handle}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Write-through cache invalidation for a handle whose chain leaf was
 * REVOKED. Used by /api/identity/change after the atomic PTB lands —
 * the OLD handle is now unclaimed on-chain, so the cache should reflect
 * that as a fresh negative entry instead of holding a stale positive.
 *
 * Same best-effort policy as invalidateAndWarmSuins.
 */
export async function invalidateRevokedSuins(handle: string): Promise<void> {
  try {
    await getSuinsCacheStore().set(
      handle,
      { result: null, cachedAt: Date.now() },
      NEGATIVE_TTL_SEC,
    );
  } catch (err) {
    console.warn(
      `[suins-cache] revoke-invalidation failed for "${handle}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Test-only: clear the in-memory cache. Production code should NOT call
 * this — use the store interface directly if you need targeted invalidation.
 */
export function _resetSuinsCacheForTests(): void {
  resetSuinsCacheStore();
}

export { SuinsRpcError };
