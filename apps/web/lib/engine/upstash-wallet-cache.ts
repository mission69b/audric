import { Redis } from '@upstash/redis';
import type { WalletCacheStore, WalletCacheEntry } from '@t2000/engine';
import { getTelemetrySink } from '@t2000/engine';

/**
 * [PR 1 — v0.55] Upstash-backed implementation of `WalletCacheStore`.
 *
 * Wallet-half twin of `UpstashDefiCacheStore`. Replaces the engine's
 * default in-memory `Map` for `fetchAddressPortfolio` so all Vercel
 * function instances and routes (`/api/portfolio`,
 * `/api/analytics/portfolio-history`, `/api/engine/chat` →
 * `balance_check`) read and write the same wallet portfolio cache state.
 *
 * Why this exists
 * ---------------
 * Pre-PR-1 the wallet cache lived in a per-process `Map`. The DeFi
 * half of this bug shipped in v0.54 (`UpstashDefiCacheStore`). PR 1
 * closes the wallet half so balance and portfolio reads also share
 * one source of truth across Vercel instances.
 *
 * During BlockVision bursts (HTTP 429 on `/account/coins`) different
 * routes independently observe different states for the same address —
 * `balance_check` in chat might serve a healthy cached wallet while a
 * fresh `/api/portfolio` request in another instance gets a degraded
 * RPC fallback. With a shared store + the engine's sticky-positive
 * write rules, every reader sees one truth: a positive blockvision
 * entry within the 30-min sticky window is preferred over any fresh
 * `sui-rpc-degraded` result.
 *
 * Failure handling
 * ----------------
 * Engine fetcher swallows store transport errors (logs + treats `get`
 * failures as a cache miss, ignores `set` failures). This impl mirrors
 * the DeFi twin: errors propagate up so the engine can decide; we
 * don't try-catch internally because the engine wrapper already does.
 * A Redis outage degrades the system to "every Vercel instance does
 * its own BlockVision fetch" — slower and more BV traffic, but never
 * broken reads.
 *
 * Serialization
 * -------------
 * `@upstash/redis` JSON-serializes both directions, so `WalletCacheEntry`
 * round-trips losslessly (numbers, strings, the `coins[]` array shape).
 * Reference equality across calls is NOT preserved — but the engine's
 * read path uses structural equality where it matters.
 *
 * Keying
 * ------
 * Address is lowercased to match the `InMemoryWalletCacheStore`
 * normalization. Sui addresses are case-insensitive after the `0x`
 * prefix in practice; keying by lowercase prevents accidental cache
 * misses from `0xABC...` vs `0xabc...` callers (typically older Audric
 * UI components vs newer ones that already lowercase).
 */
const DEFAULT_PREFIX = 'wallet:';

export class UpstashWalletCacheStore implements WalletCacheStore {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(opts?: { redis?: Redis; prefix?: string }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
    this.prefix = opts?.prefix ?? DEFAULT_PREFIX;
  }

  private key(address: string): string {
    return `${this.prefix}${address.toLowerCase()}`;
  }

  async get(address: string): Promise<WalletCacheEntry | null> {
    getTelemetrySink().counter('upstash.requests', { op: 'get', prefix: 'wallet:' });
    const value = await this.redis.get<WalletCacheEntry>(this.key(address));
    return value ?? null;
  }

  async set(address: string, entry: WalletCacheEntry, ttlSec: number): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'set', prefix: 'wallet:' });
    await this.redis.set(this.key(address), entry, { ex: ttlSec });
  }

  async delete(address: string): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'del', prefix: 'wallet:' });
    await this.redis.del(this.key(address));
  }

  async clear(): Promise<void> {
    // Cluster-wide clear of the wallet: keyspace. Used by tests and
    // `clearPortfolioCache()`. Production code should never call this
    // in a hot path — it does an O(N) SCAN. SCAN is bounded to 100
    // keys per call to avoid hot-pathing the Redis worker.
    let cursor: string | number = 0;
    do {
      getTelemetrySink().counter('upstash.requests', { op: 'scan', prefix: 'wallet:' });
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
