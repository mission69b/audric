import { Redis } from '@upstash/redis';
import type { NaviCacheStore, NaviCacheEntry } from '@t2000/engine';
import { getTelemetrySink } from '@t2000/engine';

/**
 * [PR 4 — v0.56] Upstash-backed implementation of `NaviCacheStore`.
 *
 * Caches NAVI MCP composite read results in Redis so all Vercel instances
 * share one cache. Key naming mirrors the navi-cache.ts helpers:
 *   - `navi:rates`              — global rates table (5-min TTL)
 *   - `navi:savings:<address>`  — per-address savings (30s TTL)
 *   - `navi:health:<address>`   — per-address health factor (30s TTL)
 *
 * Keys share the same Upstash instance as wallet/defi keys. The `navi:`
 * prefix keeps them separable from `defi:`, `wallet:`, and `bv-lock:`.
 *
 * Failure handling
 * ----------------
 * `get` returns `null` on error (cache miss, engine re-fetches from NAVI).
 * `set` swallows errors (cache write failure doesn't break a successful read).
 * A Redis outage degrades to "no cache" — every call hits NAVI MCP directly.
 */
export class UpstashNaviCacheStore implements NaviCacheStore {
  private readonly redis: Redis;

  constructor(opts?: { redis?: Redis }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
  }

  async get(key: string): Promise<NaviCacheEntry | null> {
    getTelemetrySink().counter('upstash.requests', { op: 'get', prefix: 'navi:' });
    const value = await this.redis.get<NaviCacheEntry>(key);
    return value ?? null;
  }

  async set(key: string, entry: NaviCacheEntry, ttlSec: number): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'set', prefix: 'navi:' });
    await this.redis.set(key, entry, { ex: ttlSec });
  }

  async delete(key: string): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'del', prefix: 'navi:' });
    await this.redis.del(key);
  }

  async clear(): Promise<void> {
    let cursor: string | number = 0;
    do {
      getTelemetrySink().counter('upstash.requests', { op: 'scan', prefix: 'navi:' });
      const result: [string | number, string[]] = await this.redis.scan(cursor, {
        match: 'navi:*',
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
