import { Redis } from '@upstash/redis';
import type { FetchLock } from '@t2000/engine';

/**
 * [PR 2 — v0.55] Upstash-backed implementation of `FetchLock`.
 *
 * Cross-instance distributed mutex backed by Redis `SET NX EX`. Used
 * by the engine's `awaitOrFetch` helper to coalesce concurrent
 * cache-misses for the same address across Vercel instances. Without
 * this lock, N concurrent instances all miss the cache for the same
 * address at the same instant and all N fan out to BlockVision —
 * 200 instances × 10 BV calls per address = 2000 calls in <1s, exactly
 * the BV-rate-limit-burst we ship to prevent.
 *
 * Why SET NX EX
 * -------------
 * `SET key value NX EX seconds` is the canonical Redis distributed-
 * lock primitive at this scale:
 *   - **NX** (Not eXists) → atomic compare-and-set: only one caller wins.
 *   - **EX** (EXpire) → TTL applied atomically with the set, so even
 *     if the leader process dies before calling `release`, the lock
 *     auto-frees after the lease expires. No phantom locks.
 *
 * Lease ownership
 * ---------------
 * We don't store an owner token. Per the engine's `FetchLock` contract:
 * "calling `release` on a key the caller doesn't hold is a no-op (we
 * accept a small window of potential ABA: if our lease expired and
 * another caller took the key, we'll harmlessly delete THEIR lock once.
 * Production traffic patterns make this exceedingly rare; the cost is
 * one extra fan-out)." For BlockVision coalescing this is the right
 * trade — the failure mode is "one extra fan-out", which is the same
 * cost we pay under contention anyway.
 *
 * Failure handling
 * ----------------
 * `acquire` errors are caught and converted to `false` so the engine
 * falls through to a direct fetch (the documented degraded path).
 * `release` errors are swallowed because the lease will auto-expire.
 * A Redis outage degrades the system to "no cross-instance coalescing"
 * — same behaviour as the in-memory default — but never breaks reads.
 *
 * Keying convention
 * -----------------
 * Engine generates keys like `bv-lock:wallet:0xabc…` and
 * `bv-lock:defi:0xabc…`. Different operations on the same address
 * MUST use different keys so they don't block each other. The address
 * is already lowercased by the engine before it reaches us — we don't
 * need to re-normalise here.
 */
const DEFAULT_PREFIX = 'lock:';

export class UpstashFetchLock implements FetchLock {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(opts?: { redis?: Redis; prefix?: string }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
    this.prefix = opts?.prefix ?? DEFAULT_PREFIX;
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  async acquire(key: string, leaseSec: number): Promise<boolean> {
    try {
      // `nx: true` → only set if not exists. `ex: leaseSec` → atomic TTL.
      // Returns 'OK' on success, null on contention (key already held).
      const result = await this.redis.set(this.k(key), '1', {
        nx: true,
        ex: leaseSec,
      });
      return result === 'OK';
    } catch (err) {
      // Backend failure — log and degrade. The engine's `awaitOrFetch`
      // contract expects `false` here so the caller falls through to
      // a direct fetch (no cross-instance coalescing, but reads still
      // work).
      console.warn(`[upstash-fetch-lock] acquire(${key}) failed (degrading):`, err);
      return false;
    }
  }

  async release(key: string): Promise<void> {
    try {
      await this.redis.del(this.k(key));
    } catch (err) {
      // Release failure is non-fatal — the lease will expire on its
      // own (`SET ... EX leaseSec`). Worst case is a small window
      // where followers wait for the lease to expire instead of
      // immediately moving on. Acceptable; logged so we notice.
      console.warn(`[upstash-fetch-lock] release(${key}) failed (non-fatal):`, err);
    }
  }
}
