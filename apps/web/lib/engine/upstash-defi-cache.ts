import { Redis } from '@upstash/redis';
import type { DefiCacheStore, DefiCacheEntry } from '@t2000/engine';

/**
 * [v0.54] Upstash-backed implementation of `DefiCacheStore`.
 *
 * Replaces the engine's default in-memory `Map` with a shared Redis
 * cache so all Vercel function instances and routes
 * (`/api/portfolio`, `/api/analytics/portfolio-history`,
 * `/api/engine/chat` → `balance_check`) read and write the same DeFi
 * cache state.
 *
 * Why this exists
 * ---------------
 * Pre-v0.54 each Vercel function had its own in-process `Map`. During
 * BlockVision bursts (HTTP 429 across DeFi protocols) different
 * routes independently observed different states for the same
 * address — the chat tool might have a healthy cache hit while the
 * portfolio canvas saw a fresh degraded fetch. The user saw three
 * different totals on the same chat turn ($36,991 / $36,992 /
 * $29,514) for the same wallet. With a shared store + the engine's
 * sticky-positive write rules, every reader sees one truth.
 *
 * Failure handling
 * ----------------
 * The engine's fetcher swallows store transport errors (logs +
 * treats as cache miss for `get`, ignores for `set`). This impl
 * mirrors that contract: errors propagate up so the engine can
 * decide; we don't try-catch internally because the engine wrapper
 * already does. This means a Redis outage degrades the system to
 * "every Vercel instance does its own BlockVision fetch" — slower
 * and more BV traffic, but never broken reads.
 *
 * Serialization
 * -------------
 * `@upstash/redis` JSON-serializes both directions, so the
 * `DefiCacheEntry` round-trips losslessly (numbers, strings,
 * nested `perProtocol` map). Reference equality across calls is NOT
 * preserved (each `get` returns a fresh deserialized object) — but
 * the engine's read path uses structural equality where it matters
 * (the only ref-equality assertions are inside engine unit tests
 * that use the in-memory store directly).
 */
const DEFAULT_PREFIX = 'defi:';

export class UpstashDefiCacheStore implements DefiCacheStore {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(opts?: { redis?: Redis; prefix?: string }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
    this.prefix = opts?.prefix ?? DEFAULT_PREFIX;
  }

  private key(address: string): string {
    // Lowercase to match the InMemory impl's normalization. Sui
    // addresses are case-insensitive after the 0x prefix in
    // practice; keying by lowercase prevents accidental cache
    // misses from `0xABC...` vs `0xabc...` callers.
    return `${this.prefix}${address.toLowerCase()}`;
  }

  async get(address: string): Promise<DefiCacheEntry | null> {
    const value = await this.redis.get<DefiCacheEntry>(this.key(address));
    return value ?? null;
  }

  async set(address: string, entry: DefiCacheEntry, ttlSec: number): Promise<void> {
    await this.redis.set(this.key(address), entry, { ex: ttlSec });
  }

  async delete(address: string): Promise<void> {
    await this.redis.del(this.key(address));
  }

  async clear(): Promise<void> {
    // Cluster-wide clear of the defi: keyspace. Used by tests and
    // `clearDefiCache()`. Production code should never call this in
    // a hot path — it does an O(N) SCAN. SCAN is bounded to 100
    // keys per call to avoid hot-pathing the Redis worker.
    let cursor: string | number = 0;
    do {
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
