/**
 * Unit tests for `bundle-proposal-store` (SPEC 14 Phase 1).
 *
 * Uses an in-memory Redis double — does NOT touch Upstash. The
 * `Redis.fromEnv()` default is overridden by passing an explicit
 * mock to each store function.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Redis } from '@upstash/redis';
import {
  writeBundleProposal,
  readBundleProposal,
  consumeBundleProposal,
  deleteBundleProposal,
  type BundleProposal,
} from '../bundle-proposal-store';

interface StoredEntry {
  value: unknown;
  expiresAtMs: number | null;
}

class InMemoryRedis {
  private store = new Map<string, StoredEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, opts?: { ex?: number }): Promise<'OK'> {
    const expiresAtMs =
      opts?.ex !== undefined ? Date.now() + opts.ex * 1000 : null;
    this.store.set(key, { value, expiresAtMs });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  _setRaw(key: string, entry: StoredEntry): void {
    this.store.set(key, entry);
  }

  _has(key: string): boolean {
    return this.store.has(key);
  }
}

/**
 * The store fns accept `Redis = Redis.fromEnv()` for ergonomic prod
 * use; tests pass a structurally-compatible double via this cast.
 * Going through `unknown` keeps the audric "no explicit any" lint
 * convention happy.
 */
function asRedis(r: InMemoryRedis): Redis {
  return r as unknown as Redis;
}

function makeProposal(overrides?: Partial<BundleProposal>): BundleProposal {
  return {
    bundleId: 'b1',
    walletAddress: '0xabc',
    steps: [
      { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
      { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' } },
    ],
    expiresAt: Date.now() + 60_000,
    validatedAt: Date.now(),
    summary: 'withdraw 3 USDC → send 1 USDC',
    ...overrides,
  };
}

describe('bundle-proposal-store', () => {
  let redis: InMemoryRedis;

  beforeEach(() => {
    redis = new InMemoryRedis();
  });

  describe('writeBundleProposal', () => {
    it('persists a proposal under the session-scoped key', async () => {
      await writeBundleProposal('s_123', makeProposal(), asRedis(redis));
      expect(redis._has('bundle:proposal:s_123')).toBe(true);
    });

    it('overwrites an existing proposal for the same session (Q3 locked decision)', async () => {
      await writeBundleProposal('s_123', makeProposal({ bundleId: 'first' }), asRedis(redis));
      await writeBundleProposal('s_123', makeProposal({ bundleId: 'second' }), asRedis(redis));
      const result = await readBundleProposal('s_123', asRedis(redis));
      expect(result?.bundleId).toBe('second');
    });

    it('rejects empty / non-string sessionId', async () => {
      await expect(
        writeBundleProposal('', makeProposal(), asRedis(redis)),
      ).rejects.toThrow(/sessionId is required/);
    });
  });

  describe('readBundleProposal', () => {
    it('returns null when no proposal exists', async () => {
      const result = await readBundleProposal('s_missing', asRedis(redis));
      expect(result).toBeNull();
    });

    it('returns the proposal when fresh', async () => {
      const proposal = makeProposal();
      await writeBundleProposal('s_123', proposal, asRedis(redis));
      const result = await readBundleProposal('s_123', asRedis(redis));
      expect(result?.bundleId).toBe(proposal.bundleId);
      expect(result?.steps).toEqual(proposal.steps);
    });

    it('returns null when the proposal is past expiresAt (defensive recheck)', async () => {
      const expired = makeProposal({ expiresAt: Date.now() - 1000 });
      redis._setRaw('bundle:proposal:s_123', {
        value: expired,
        expiresAtMs: Date.now() + 60_000,
      });
      const result = await readBundleProposal('s_123', asRedis(redis));
      expect(result).toBeNull();
    });

    it('does NOT delete the proposal (read-only)', async () => {
      await writeBundleProposal('s_123', makeProposal(), asRedis(redis));
      await readBundleProposal('s_123', asRedis(redis));
      expect(redis._has('bundle:proposal:s_123')).toBe(true);
    });
  });

  describe('consumeBundleProposal', () => {
    it('returns the proposal AND deletes it', async () => {
      const proposal = makeProposal();
      await writeBundleProposal('s_123', proposal, asRedis(redis));
      const result = await consumeBundleProposal('s_123', asRedis(redis));
      expect(result?.bundleId).toBe(proposal.bundleId);
      expect(redis._has('bundle:proposal:s_123')).toBe(false);
    });

    it('returns null and is a no-op when nothing is stashed', async () => {
      const result = await consumeBundleProposal('s_missing', asRedis(redis));
      expect(result).toBeNull();
    });

    it('a second consume call returns null (single-use semantics)', async () => {
      const proposal = makeProposal();
      await writeBundleProposal('s_123', proposal, asRedis(redis));
      const first = await consumeBundleProposal('s_123', asRedis(redis));
      const second = await consumeBundleProposal('s_123', asRedis(redis));
      expect(first?.bundleId).toBe(proposal.bundleId);
      expect(second).toBeNull();
    });
  });

  describe('deleteBundleProposal', () => {
    it('removes the proposal', async () => {
      await writeBundleProposal('s_123', makeProposal(), asRedis(redis));
      await deleteBundleProposal('s_123', asRedis(redis));
      expect(redis._has('bundle:proposal:s_123')).toBe(false);
    });

    it('is idempotent when nothing is stashed', async () => {
      await expect(
        deleteBundleProposal('s_missing', asRedis(redis)),
      ).resolves.toBeUndefined();
    });
  });
});
