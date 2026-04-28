// ---------------------------------------------------------------------------
// PR 7 — Upstash-backed cache for `getTransactionHistory()` results.
//
// Why this exists
// ---------------
// `lib/transaction-history.ts` makes 2 parallel `client.queryTransactionBlocks`
// calls (FromAddress + ToAddress) on every `/api/activity` and `/api/history`
// hit. The underlying client is pointed at BlockVision's Sui RPC endpoint
// (`https://sui-mainnet.blockvision.org/v1/<key>`), which has its own rate
// limits separate from BlockVision's Indexer REST API. April 2026 production
// logs showed sustained 429s on this path during dashboard auto-refresh
// bursts:
//
//   [transaction-history] FromAddress query failed:
//     Error: Unexpected status code: 429
//
// The `.catch()` in `transaction-history.ts` swallows the error and returns
// an empty array, so the route still returns 200 — but the user sees a
// blank activity feed during the burst.
//
// This module is the same SSOT pattern as PR 1 (`upstash-wallet-cache`) and
// PR 4 (`upstash-navi-cache`): Upstash-backed Redis cache shared across all
// Vercel function instances, so 100 concurrent dashboard loads coalesce
// into 1 RPC fan-out.
//
// Telemetry
// ---------
// Emits `upstash.requests` (op=get/set/del/scan, prefix=tx-history:) so the
// dashboard at `/admin/scaling` can chart the request rate alongside the
// other Upstash-backed caches.
// ---------------------------------------------------------------------------

import { Redis } from '@upstash/redis';
import { getTelemetrySink } from '@t2000/engine';
import type { ChainTxRecord } from './transaction-history';

const DEFAULT_PREFIX = 'tx-history:';

/**
 * Cached payload — the parsed records plus the millisecond timestamp at
 * which they were fetched. `cachedAt` is used by callers that want to
 * decide "is this fresh enough?" (e.g. follower polling in `awaitOrFetch`).
 */
export interface TxHistoryCacheEntry {
  records: ChainTxRecord[];
  cachedAt: number;
}

/**
 * Tiny pluggable interface so tests can inject an in-memory store and
 * production injects the Upstash impl. Same shape as the engine's
 * `WalletCacheStore` / `NaviCacheStore` — kept local to audric because
 * `ChainTxRecord` is an audric type.
 */
export interface TxHistoryCacheStore {
  get(key: string): Promise<TxHistoryCacheEntry | null>;
  set(key: string, entry: TxHistoryCacheEntry, ttlSec: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class UpstashTxHistoryCacheStore implements TxHistoryCacheStore {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(opts?: { redis?: Redis; prefix?: string }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
    this.prefix = opts?.prefix ?? DEFAULT_PREFIX;
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<TxHistoryCacheEntry | null> {
    getTelemetrySink().counter('upstash.requests', { op: 'get', prefix: 'tx-history:' });
    const value = await this.redis.get<TxHistoryCacheEntry>(this.k(key));
    return value ?? null;
  }

  async set(key: string, entry: TxHistoryCacheEntry, ttlSec: number): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'set', prefix: 'tx-history:' });
    await this.redis.set(this.k(key), entry, { ex: ttlSec });
  }

  async delete(key: string): Promise<void> {
    getTelemetrySink().counter('upstash.requests', { op: 'del', prefix: 'tx-history:' });
    await this.redis.del(this.k(key));
  }

  async clear(): Promise<void> {
    let cursor: string | number = 0;
    do {
      getTelemetrySink().counter('upstash.requests', { op: 'scan', prefix: 'tx-history:' });
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

// ---------------------------------------------------------------------------
// In-memory fallback (used for tests + when Upstash env is missing)
// ---------------------------------------------------------------------------

class InMemoryTxHistoryCacheStore implements TxHistoryCacheStore {
  private readonly map = new Map<string, { entry: TxHistoryCacheEntry; expiry: number }>();

  async get(key: string): Promise<TxHistoryCacheEntry | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiry < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.entry;
  }

  async set(key: string, entry: TxHistoryCacheEntry, ttlSec: number): Promise<void> {
    this.map.set(key, { entry, expiry: Date.now() + ttlSec * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}

// ---------------------------------------------------------------------------
// Module-level injection slot
// ---------------------------------------------------------------------------

let activeStore: TxHistoryCacheStore = new InMemoryTxHistoryCacheStore();

export function setTxHistoryCacheStore(store: TxHistoryCacheStore): void {
  activeStore = store;
}

export function getTxHistoryCacheStore(): TxHistoryCacheStore {
  return activeStore;
}

export function resetTxHistoryCacheStore(): void {
  activeStore = new InMemoryTxHistoryCacheStore();
}

// ---------------------------------------------------------------------------
// TTL — chain history is mostly stable; user-perceived freshness is what
// matters. 30s means a tx the user just made appears in their feed within
// the next dashboard refresh cycle.
// ---------------------------------------------------------------------------

export const TX_HISTORY_TTL_SEC = 30;

// ---------------------------------------------------------------------------
// Cache-key fingerprint — must encode every option that affects the result
// so different call shapes don't share an entry.
// ---------------------------------------------------------------------------

export function txHistoryCacheKey(
  address: string,
  opts: { limit: number; skipOutgoing: boolean; incomingLimit: number; excludeLegacy: boolean },
): string {
  return `${address.toLowerCase()}:l${opts.limit}:s${opts.skipOutgoing ? 1 : 0}:i${opts.incomingLimit}:e${opts.excludeLegacy ? 1 : 0}`;
}
