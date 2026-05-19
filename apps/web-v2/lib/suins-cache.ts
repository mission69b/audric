import { resolveSuinsViaRpc } from "@t2000/engine";

export { SuinsRpcError } from "@t2000/engine";

/**
 * Per-process cache for SuiNS handle → address resolution.
 *
 * ## v0.7c Session 3 lean port
 *
 * Ported from `audric/apps/web/lib/suins-cache.ts` (309 LoC) for the Phase 6
 * Audric Store rebuild. The in-memory store is sufficient for web-v2's
 * Session 3 surface (the public profile page reads SuiNS; it never mints
 * or revokes). The Upstash store + `invalidateAndWarmSuins` /
 * `invalidateRevokedSuins` write-through helpers stay in apps/web — the
 * `/api/identity/*` routes that mutate SuiNS state live there until v0.7e.
 *
 * If a later session ports the identity write routes into web-v2, lift the
 * Upstash branch from apps/web with the `@upstash/redis` dep at the same
 * time.
 *
 * ## Cache policy (unchanged from apps/web)
 *
 * - Positive entries: cached for 5 min — SuiNS leaves are stable on the
 *   order of days unless the user explicitly mints / revokes.
 * - Negative entries: cached for 10 sec — a freshly-minted handle should
 *   resolve within ~10 seconds even on a Lambda that hasn't picked up the
 *   write-through invalidation. The shorter TTL is the trade-off for not
 *   having that invalidation here.
 * - RPC errors: NOT cached. Caller treats them like `null`; next request
 *   re-attempts the lookup (transient blips shouldn't be sticky).
 */

const POSITIVE_TTL_SEC = 5 * 60;
const NEGATIVE_TTL_SEC = 10;

interface CacheEntry {
  cachedAt: number;
  result: string | null;
}

export interface SuinsCacheStore {
  clear(): Promise<void>;
  delete(handle: string): Promise<void>;
  get(handle: string): Promise<CacheEntry | null>;
  set(handle: string, entry: CacheEntry, ttlSec: number): Promise<void>;
}

class InMemorySuinsCacheStore implements SuinsCacheStore {
  private readonly map = new Map<
    string,
    { entry: CacheEntry; expiry: number }
  >();

  // biome-ignore lint/suspicious/useAwait: SuinsCacheStore interface returns Promise; sync impl needs the signature
  async get(handle: string): Promise<CacheEntry | null> {
    const hit = this.map.get(handle);
    if (!hit) {
      return null;
    }
    if (hit.expiry < Date.now()) {
      this.map.delete(handle);
      return null;
    }
    return hit.entry;
  }

  // biome-ignore lint/suspicious/useAwait: SuinsCacheStore interface returns Promise; sync impl needs the signature
  async set(handle: string, entry: CacheEntry, ttlSec: number): Promise<void> {
    this.map.set(handle, { entry, expiry: Date.now() + ttlSec * 1000 });
  }

  // biome-ignore lint/suspicious/useAwait: SuinsCacheStore interface returns Promise; sync impl needs the signature
  async delete(handle: string): Promise<void> {
    this.map.delete(handle);
  }

  // biome-ignore lint/suspicious/useAwait: SuinsCacheStore interface returns Promise; sync impl needs the signature
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
 * Cached wrapper around `resolveSuinsViaRpc`. Resolves `<handle>.audric.sui`
 * to its address, caching the result. The caller distinguishes
 * "checked, no leaf" (returns `null`) from "RPC threw" (propagates the
 * `SuinsRpcError`).
 *
 * Cache failures degrade silently to live RPC — the cache is purely
 * additive, never the source of truth.
 */
export async function resolveSuinsCached(
  handle: string,
  opts: { suiRpcUrl: string }
): Promise<string | null> {
  const store = getSuinsCacheStore();

  let cached: CacheEntry | null = null;
  try {
    cached = await store.get(handle);
  } catch (err) {
    console.warn(
      `[suins-cache] store.get failed for "${handle}", falling through to live RPC:`,
      err instanceof Error ? err.message : err
    );
  }

  if (cached) {
    return cached.result;
  }

  const result = await resolveSuinsViaRpc(handle, {
    suiRpcUrl: opts.suiRpcUrl,
  });

  try {
    await store.set(
      handle,
      { result, cachedAt: Date.now() },
      result === null ? NEGATIVE_TTL_SEC : POSITIVE_TTL_SEC
    );
  } catch (err) {
    console.warn(
      `[suins-cache] store.set failed for "${handle}":`,
      err instanceof Error ? err.message : err
    );
  }

  return result;
}
