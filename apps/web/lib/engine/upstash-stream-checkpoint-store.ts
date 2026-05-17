// ---------------------------------------------------------------------------
// UpstashStreamCheckpointStore — Redis-backed StreamCheckpointStore
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 5.5 (Audric) — multi-instance page-reload / reconnect
// resume for the LIVE chat stream. Keys checkpoints under a caller-supplied
// `namespace` (audric passes `sessionId`) so one user cannot read another's
// stream bytes.
//
// Wire format: Redis LIST per `streamId`, each element JSON.stringify of
// `EngineEvent` with a stable Error envelope for `{ type: 'error' }` events
// (plain JSON.stringify drops `Error.message`).
//
// TTL: sliding window (default 5 min) on every append — matches
// `InMemoryStreamCheckpointStore` in `@t2000/engine` v2.2.0.
// ---------------------------------------------------------------------------

import { Redis } from '@upstash/redis';
import type { EngineEvent, StreamCheckpointStore } from '@t2000/engine';

/** Serialize one EngineEvent for Redis storage (Error-safe). */
export function stableSerializeEngineEvent(ev: EngineEvent): string {
  if (ev.type === 'error') {
    return JSON.stringify({
      type: 'error',
      error: {
        message: ev.error.message,
        name: ev.error.name,
      },
    });
  }
  return JSON.stringify(ev);
}

/** Restore EngineEvent from Redis (Error round-trip). */
export function parseStoredEngineEvent(raw: string): EngineEvent {
  const o = JSON.parse(raw) as {
    type: string;
    error?: { message: string; name?: string };
  };
  if (o.type === 'error' && o.error && typeof o.error.message === 'string') {
    const e = new Error(o.error.message);
    if (o.error.name) {
      e.name = o.error.name;
    }
    return { type: 'error', error: e };
  }
  return o as EngineEvent;
}

const DEFAULT_TTL_SEC = 5 * 60;

export interface UpstashStreamCheckpointStoreOptions {
  /** Session-scoped id (audric: chat `sessionId`). Prevents cross-session reads. */
  namespace: string;
  redis?: Redis;
  /** Sliding TTL per stream (seconds). Default 300 (5 min). */
  ttlSec?: number;
  /** Key prefix. Default `v1:scp`. */
  keyPrefix?: string;
}

/**
 * Redis LIST-backed checkpoint log — one list per `streamId`, namespaced by
 * `namespace` + optional prefix.
 */
export class UpstashStreamCheckpointStore implements StreamCheckpointStore {
  private readonly redis: Redis;
  private readonly ttlSec: number;
  private readonly prefix: string;
  private readonly namespace: string;

  constructor(opts: UpstashStreamCheckpointStoreOptions) {
    if (!opts.namespace || !opts.namespace.trim()) {
      throw new Error('UpstashStreamCheckpointStore: namespace is required');
    }
    this.redis = opts.redis ?? Redis.fromEnv();
    this.ttlSec = opts.ttlSec ?? DEFAULT_TTL_SEC;
    this.prefix = opts.keyPrefix ?? 'v1:scp';
    this.namespace = opts.namespace.trim();
  }

  private key(streamId: string): string {
    return `${this.prefix}:${this.namespace}:${streamId}`;
  }

  async append(streamId: string, event: EngineEvent): Promise<number> {
    const k = this.key(streamId);
    const payload = stableSerializeEngineEvent(event);
    try {
      const len = await this.redis.rpush<string>(k, payload);
      await this.redis.expire(k, this.ttlSec);
      return typeof len === 'number' ? len : 1;
    } catch (err) {
      // Fire-and-forget contract: swallow so the live SSE stream never stalls.
      console.error('[UpstashStreamCheckpointStore] append failed (non-fatal):', err);
      return 0;
    }
  }

  async *replay(streamId: string): AsyncGenerator<EngineEvent> {
    const k = this.key(streamId);
    let rows: string[];
    try {
      rows = await this.redis.lrange<string>(k, 0, -1);
    } catch (err) {
      console.error('[UpstashStreamCheckpointStore] replay read failed:', err);
      throw err;
    }
    if (!rows || rows.length === 0) return;
    for (const raw of rows) {
      try {
        yield parseStoredEngineEvent(raw);
      } catch (parseErr) {
        console.error('[UpstashStreamCheckpointStore] bad checkpoint row, skipping:', parseErr);
      }
    }
  }

  async clear(streamId: string): Promise<void> {
    try {
      await this.redis.del(this.key(streamId));
    } catch (err) {
      console.error('[UpstashStreamCheckpointStore] clear failed (non-fatal):', err);
    }
  }

  async has(streamId: string): Promise<boolean> {
    try {
      const n = await this.redis.exists(this.key(streamId));
      return n === 1;
    } catch {
      return false;
    }
  }
}
