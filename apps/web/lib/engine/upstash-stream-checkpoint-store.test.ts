/**
 * Unit tests for `UpstashStreamCheckpointStore` (SPEC 37 v0.7a Phase 5.5).
 *
 * Uses an in-memory Redis double — does NOT touch Upstash. The same
 * `cast-via-unknown` pattern as `bundle-proposal-store.test.ts`.
 *
 * Covers the StreamCheckpointStore contract (append / replay / clear /
 * has) PLUS the audric-side concerns the engine in-memory tests can't
 * cover:
 *   - Error event round-trip (plain JSON.stringify drops Error.message)
 *   - Namespace isolation (no cross-session reads)
 *   - Fire-and-forget append (transient Redis failure must NOT throw)
 *   - replay throws on read failure (engine surfaces as EngineEvent.error)
 *   - Sliding TTL on every append (via the `ex` argument shape)
 *   - Constructor rejects empty namespace
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Redis } from '@upstash/redis';
import type { EngineEvent } from '@t2000/engine';
import {
  UpstashStreamCheckpointStore,
  stableSerializeEngineEvent,
  parseStoredEngineEvent,
} from './upstash-stream-checkpoint-store';

// ---------------------------------------------------------------------------
// In-memory Redis double — covers ONLY the methods the store touches.
// ---------------------------------------------------------------------------

class InMemoryRedis {
  private lists = new Map<string, string[]>();
  private ttls = new Map<string, number>();

  /** Test hook — fail subsequent calls until reset. */
  failNext: { method: 'rpush' | 'lrange' | 'del' | 'exists' | 'expire' | null } =
    { method: null };

  /** Test hook — count `expire(k, ttl)` calls per key. */
  expireCalls: Array<{ key: string; ttl: number }> = [];

  async rpush<_T>(key: string, value: string): Promise<number> {
    if (this.failNext.method === 'rpush') {
      this.failNext.method = null;
      throw new Error('simulated redis rpush failure');
    }
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async lrange<_T>(key: string, start: number, end: number): Promise<string[]> {
    if (this.failNext.method === 'lrange') {
      this.failNext.method = null;
      throw new Error('simulated redis lrange failure');
    }
    const list = this.lists.get(key) ?? [];
    // -1 is "to end" in Redis semantics.
    const effectiveEnd = end === -1 ? list.length : end + 1;
    return list.slice(start, effectiveEnd);
  }

  async del(key: string): Promise<number> {
    if (this.failNext.method === 'del') {
      this.failNext.method = null;
      throw new Error('simulated redis del failure');
    }
    const had = this.lists.has(key);
    this.lists.delete(key);
    this.ttls.delete(key);
    return had ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    if (this.failNext.method === 'exists') {
      this.failNext.method = null;
      throw new Error('simulated redis exists failure');
    }
    return this.lists.has(key) ? 1 : 0;
  }

  async expire(key: string, ttlSec: number): Promise<number> {
    if (this.failNext.method === 'expire') {
      this.failNext.method = null;
      throw new Error('simulated redis expire failure');
    }
    this.expireCalls.push({ key, ttl: ttlSec });
    this.ttls.set(key, ttlSec);
    return this.lists.has(key) ? 1 : 0;
  }

  // Test helpers
  _rawList(key: string): string[] | undefined {
    return this.lists.get(key);
  }
  _allKeys(): string[] {
    return [...this.lists.keys()];
  }
}

const asRedis = (r: InMemoryRedis): Redis => r as unknown as Redis;

const textEv = (s: string): EngineEvent => ({ type: 'text_delta', text: s });

// ---------------------------------------------------------------------------
// Serialization helpers — pure-function tests, no Redis needed
// ---------------------------------------------------------------------------

describe('stableSerializeEngineEvent + parseStoredEngineEvent', () => {
  it('round-trips a text_delta event verbatim', () => {
    const ev: EngineEvent = { type: 'text_delta', text: 'hello world' };
    const out = parseStoredEngineEvent(stableSerializeEngineEvent(ev));
    expect(out).toEqual(ev);
  });

  it('round-trips Error.message + name (plain JSON.stringify would drop both)', () => {
    const err = new Error('NAVI MCP timeout after 5s');
    err.name = 'McpTimeoutError';
    const ev: EngineEvent = { type: 'error', error: err };

    // Plain JSON.stringify drops `Error.message` because it's a
    // non-enumerable property on Error.prototype. (Setting `.name`
    // turns it into an own property, so it survives — but `.message`
    // never does without help.) This is the bug we're guarding
    // against with the stable Error envelope.
    const naive = JSON.parse(JSON.stringify(ev)) as { error: { message?: string } };
    expect(naive.error.message).toBeUndefined();

    const serialized = stableSerializeEngineEvent(ev);
    const restored = parseStoredEngineEvent(serialized);

    expect(restored.type).toBe('error');
    if (restored.type !== 'error') throw new Error('type narrow');
    expect(restored.error).toBeInstanceOf(Error);
    expect(restored.error.message).toBe('NAVI MCP timeout after 5s');
    expect(restored.error.name).toBe('McpTimeoutError');
  });

  it('round-trips tool_start (verbatim — no Error envelope needed)', () => {
    const ev: EngineEvent = {
      type: 'tool_start',
      toolName: 'balance_check',
      toolUseId: 'tu_123',
      input: { address: '0xabc' },
    };
    expect(parseStoredEngineEvent(stableSerializeEngineEvent(ev))).toEqual(ev);
  });

  it('round-trips stream_started (the Phase 5.5 first-event marker)', () => {
    const ev: EngineEvent = { type: 'stream_started', streamId: 'uuid-abc-123' };
    expect(parseStoredEngineEvent(stableSerializeEngineEvent(ev))).toEqual(ev);
  });
});

// ---------------------------------------------------------------------------
// UpstashStreamCheckpointStore — contract + audric-specific concerns
// ---------------------------------------------------------------------------

describe('UpstashStreamCheckpointStore', () => {
  let redis: InMemoryRedis;
  let store: UpstashStreamCheckpointStore;

  beforeEach(() => {
    redis = new InMemoryRedis();
    store = new UpstashStreamCheckpointStore({
      namespace: 'sess-1',
      redis: asRedis(redis),
    });
  });

  it('constructor rejects empty namespace (would collide across sessions)', () => {
    expect(
      () => new UpstashStreamCheckpointStore({ namespace: '', redis: asRedis(redis) }),
    ).toThrow(/namespace is required/);
    expect(
      () => new UpstashStreamCheckpointStore({ namespace: '   ', redis: asRedis(redis) }),
    ).toThrow(/namespace is required/);
  });

  it('append rpushes the serialized event and refreshes TTL (sliding window)', async () => {
    await store.append('s1', textEv('chunk-1'));
    await store.append('s1', textEv('chunk-2'));

    expect(redis._rawList('v1:scp:sess-1:s1')).toEqual([
      JSON.stringify({ type: 'text_delta', text: 'chunk-1' }),
      JSON.stringify({ type: 'text_delta', text: 'chunk-2' }),
    ]);

    // Default TTL = 300s, sliding (called on EVERY append, not just first).
    expect(redis.expireCalls).toEqual([
      { key: 'v1:scp:sess-1:s1', ttl: 300 },
      { key: 'v1:scp:sess-1:s1', ttl: 300 },
    ]);
  });

  it('honors custom ttlSec and keyPrefix', async () => {
    const custom = new UpstashStreamCheckpointStore({
      namespace: 'sess-2',
      redis: asRedis(redis),
      ttlSec: 60,
      keyPrefix: 'audric:scp:v2',
    });
    await custom.append('s1', textEv('x'));
    expect(redis.expireCalls).toEqual([{ key: 'audric:scp:v2:sess-2:s1', ttl: 60 }]);
  });

  it('replay yields events in append order', async () => {
    await store.append('s1', textEv('a'));
    await store.append('s1', textEv('b'));
    await store.append('s1', textEv('c'));

    const replayed: EngineEvent[] = [];
    for await (const ev of store.replay('s1')) replayed.push(ev);
    expect(replayed).toEqual([textEv('a'), textEv('b'), textEv('c')]);
  });

  it('replay yields nothing for an unknown streamId (no throw)', async () => {
    const out: EngineEvent[] = [];
    for await (const ev of store.replay('never-existed')) out.push(ev);
    expect(out).toEqual([]);
  });

  it('replay round-trips an error event via the stable Error envelope', async () => {
    const err = new Error('rpc 429');
    err.name = 'RateLimitError';
    await store.append('s1', { type: 'error', error: err });

    const out: EngineEvent[] = [];
    for await (const ev of store.replay('s1')) out.push(ev);

    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('error');
    if (out[0]!.type !== 'error') throw new Error('type narrow');
    expect(out[0]!.error.message).toBe('rpc 429');
    expect(out[0]!.error.name).toBe('RateLimitError');
  });

  it('clear deletes the stream key', async () => {
    await store.append('s1', textEv('x'));
    expect(await store.has('s1')).toBe(true);

    await store.clear('s1');
    expect(await store.has('s1')).toBe(false);

    // Idempotent: second clear is a no-op.
    await expect(store.clear('s1')).resolves.toBeUndefined();
    await expect(store.clear('never-existed')).resolves.toBeUndefined();
  });

  it('has returns false for unknown streamId', async () => {
    expect(await store.has('not-there')).toBe(false);
  });

  // -----------------------------------------------------------------
  // Namespace isolation — the security-critical invariant
  // -----------------------------------------------------------------

  it('namespace isolation — store A cannot replay store B with the same streamId', async () => {
    const storeA = new UpstashStreamCheckpointStore({
      namespace: 'session-alice',
      redis: asRedis(redis),
    });
    const storeB = new UpstashStreamCheckpointStore({
      namespace: 'session-bob',
      redis: asRedis(redis),
    });

    // Same streamId. In real life this would only collide on a uuid
    // collision, but the namespacing makes it impossible for Alice's
    // events to surface in Bob's session even if the engine somehow
    // generated the same streamId for both.
    await storeA.append('shared-id', textEv('alice-only secret'));

    const replayedB: EngineEvent[] = [];
    for await (const ev of storeB.replay('shared-id')) replayedB.push(ev);
    expect(replayedB).toEqual([]);

    expect(await storeB.has('shared-id')).toBe(false);

    // And Alice can still read her own.
    const replayedA: EngineEvent[] = [];
    for await (const ev of storeA.replay('shared-id')) replayedA.push(ev);
    expect(replayedA).toEqual([textEv('alice-only secret')]);

    // Sanity: confirm two distinct keys actually exist in Redis.
    expect(redis._allKeys()).toEqual(['v1:scp:session-alice:shared-id']);
  });

  // -----------------------------------------------------------------
  // Fire-and-forget semantics — per StreamCheckpointStore contract
  // -----------------------------------------------------------------

  it('append swallows transient Redis failure and returns 0 (live stream never stalls)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    redis.failNext.method = 'rpush';
    const n = await store.append('s1', textEv('x'));
    expect(n).toBe(0);

    expect(errSpy).toHaveBeenCalledWith(
      '[UpstashStreamCheckpointStore] append failed (non-fatal):',
      expect.any(Error),
    );

    // Next append succeeds (failure was one-shot, store didn't latch).
    redis.failNext.method = null;
    const n2 = await store.append('s1', textEv('y'));
    expect(n2).toBe(1);

    errSpy.mockRestore();
  });

  it('replay re-throws on read failure (engine MUST surface as EngineEvent.error)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    redis.failNext.method = 'lrange';

    const consume = async () => {
      const out: EngineEvent[] = [];
      for await (const ev of store.replay('s1')) out.push(ev);
      return out;
    };

    await expect(consume()).rejects.toThrow(/lrange failure/);
    expect(errSpy).toHaveBeenCalledWith(
      '[UpstashStreamCheckpointStore] replay read failed:',
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it('clear swallows transient Redis failure (best-effort cleanup)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    redis.failNext.method = 'del';
    await expect(store.clear('s1')).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledWith(
      '[UpstashStreamCheckpointStore] clear failed (non-fatal):',
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it('has returns false (not throw) on Redis failure (degrades to "no checkpoint")', async () => {
    redis.failNext.method = 'exists';
    expect(await store.has('s1')).toBe(false);
  });

  // -----------------------------------------------------------------
  // Robustness — skip malformed checkpoint rows during replay
  // -----------------------------------------------------------------

  it('replay skips malformed rows (logs warning, continues) instead of erroring the whole stream', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Inject a real event + a corrupted row directly into the
    // underlying list (simulating an old/buggy producer or a write
    // that landed truncated).
    await store.append('s1', textEv('valid-1'));
    redis._rawList('v1:scp:sess-1:s1')!.push('not json at all');
    await store.append('s1', textEv('valid-2'));

    const out: EngineEvent[] = [];
    for await (const ev of store.replay('s1')) out.push(ev);

    expect(out).toEqual([textEv('valid-1'), textEv('valid-2')]);
    expect(errSpy).toHaveBeenCalledWith(
      '[UpstashStreamCheckpointStore] bad checkpoint row, skipping:',
      expect.any(Error),
    );

    errSpy.mockRestore();
  });
});
