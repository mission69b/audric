import { getTelemetrySink, resolveSuinsViaRpc } from "@t2000/engine";
import { upstash } from "@/lib/upstash";

export { SuinsRpcError } from "@t2000/engine";

/**
 * Cross-Lambda cache for SuiNS handle → address resolution.
 *
 * ## Two-tier port lineage
 *
 * - v0.7c Session 3 (initial port): in-memory store only, for the public
 *   profile-page read path that never mints / revokes.
 * - v0.7e Phase 2 / S.253 (this revision, 2026-05-22): Upstash store +
 *   write-through helpers lifted across with `/api/identity/reserve` and
 *   `/api/identity/change`. Web-v2 is now the canonical writer.
 *
 * The Upstash store is opt-in by env: `lib/upstash.ts` exports `null`
 * when Upstash REST vars are absent, in which case `getDefaultSuinsCacheStore`
 * falls back to the in-memory store. Local dev / preview deploys boot
 * without Upstash and degrade to per-Lambda caching (same behaviour as
 * the original Session 3 port). Production audric-web-v2 has the same
 * Upstash creds as audric-web, so the store is identical to apps/web
 * post-S.253.
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
const PREFIX = "suins:";

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

/**
 * Production store backed by Upstash Redis. Shared across every Lambda in
 * the fleet so cold-start instances hit a warm cache instead of paying the
 * full SuiNS RPC round-trip.
 *
 * [S.253] Lifted verbatim from apps/web/lib/suins-cache.ts during the
 * v0.7e Phase 2 cutover. Tagged with `getTelemetrySink` so audric ops
 * dashboards see consistent `upstash.requests` counters across both apps
 * during the soak window.
 */
export class UpstashSuinsCacheStore implements SuinsCacheStore {
  private readonly redis: NonNullable<typeof upstash>;
  private readonly prefix: string;

  constructor(opts: { redis: NonNullable<typeof upstash>; prefix?: string }) {
    this.redis = opts.redis;
    this.prefix = opts.prefix ?? PREFIX;
  }

  private k(handle: string): string {
    return `${this.prefix}${handle}`;
  }

  async get(handle: string): Promise<CacheEntry | null> {
    getTelemetrySink().counter("upstash.requests", {
      op: "get",
      prefix: PREFIX,
    });
    const value = await this.redis.get<CacheEntry>(this.k(handle));
    return value ?? null;
  }

  async set(handle: string, entry: CacheEntry, ttlSec: number): Promise<void> {
    getTelemetrySink().counter("upstash.requests", {
      op: "set",
      prefix: PREFIX,
    });
    await this.redis.set(this.k(handle), entry, { ex: ttlSec });
  }

  async delete(handle: string): Promise<void> {
    getTelemetrySink().counter("upstash.requests", {
      op: "del",
      prefix: PREFIX,
    });
    await this.redis.del(this.k(handle));
  }

  async clear(): Promise<void> {
    let cursor: string | number = 0;
    do {
      getTelemetrySink().counter("upstash.requests", {
        op: "scan",
        prefix: PREFIX,
      });
      const result: [string | number, string[]] = await this.redis.scan(
        cursor,
        {
          match: `${this.prefix}*`,
          count: 100,
        }
      );
      const [next, keys] = result;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      cursor = next;
    } while (cursor !== 0 && cursor !== "0");
  }
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

function getDefaultSuinsCacheStore(): SuinsCacheStore {
  if (upstash) {
    return new UpstashSuinsCacheStore({ redis: upstash });
  }
  return new InMemorySuinsCacheStore();
}

let activeStore: SuinsCacheStore = getDefaultSuinsCacheStore();

export function setSuinsCacheStore(store: SuinsCacheStore): void {
  activeStore = store;
}

export function getSuinsCacheStore(): SuinsCacheStore {
  return activeStore;
}

export function resetSuinsCacheStore(): void {
  activeStore = getDefaultSuinsCacheStore();
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

/**
 * Write-through cache update for the freshly-minted positive resolution.
 *
 * Call this from any route that just MUTATED on-chain SuiNS state for a
 * given handle (currently /api/identity/reserve and /api/identity/change).
 *
 * Pure delete-on-mint would force the next reader to hit live RPC.
 * Write-through covers (a) eliminating false-AVAILABLE picker reads from
 * a stale negative entry, (b) warming the /<username> page render, and
 * (c) speeding up the next picker check for the same name — all at the
 * cost of one extra Upstash SET (~10ms).
 *
 * Failure mode: best-effort. A failed write-through means the next reader
 * pays for one live RPC call. Never throws.
 */
export async function invalidateAndWarmSuins(
  handle: string,
  newAddress: string
): Promise<void> {
  try {
    await getSuinsCacheStore().set(
      handle,
      { result: newAddress, cachedAt: Date.now() },
      POSITIVE_TTL_SEC
    );
  } catch (err) {
    console.warn(
      `[suins-cache] write-through warm-up failed for "${handle}":`,
      err instanceof Error ? err.message : err
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
      NEGATIVE_TTL_SEC
    );
  } catch (err) {
    console.warn(
      `[suins-cache] revoke-invalidation failed for "${handle}":`,
      err instanceof Error ? err.message : err
    );
  }
}
