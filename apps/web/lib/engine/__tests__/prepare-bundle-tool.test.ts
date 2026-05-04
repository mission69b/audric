/**
 * Unit tests for `prepare_bundle` tool (SPEC 14 Phase 1).
 *
 * Two test surfaces:
 *   1. The internal inference helpers (`__testOnly__`) — pin behavior
 *      to a known-good set of cases so audric's local copy stays in
 *      lockstep with the engine-side originals (TODO: switch to engine
 *      imports at SPEC 14 Phase 3 retirement).
 *   2. The tool's `call(input, context)` — uses an in-memory Redis
 *      mock to assert validation gates, chain-mode auto-population,
 *      and stash side-effects.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { MAX_BUNDLE_OPS, type ToolContext } from '@t2000/engine';
import { audricPrepareBundleTool, __testOnly__ } from '../prepare-bundle-tool';
import * as store from '../bundle-proposal-store';
import type { BundleProposal } from '../bundle-proposal-store';

const {
  inferProducerOutputAsset,
  inferConsumerInputAsset,
  shouldChainCoin,
  summarizeBundle,
} = __testOnly__;

interface StoredEntry {
  value: unknown;
  expiresAtMs: number | null;
}
class InMemoryRedis {
  private map = new Map<string, StoredEntry>();
  async get<T>(key: string): Promise<T | null> {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAtMs !== null && e.expiresAtMs <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e.value as T;
  }
  async set<T>(key: string, value: T, opts?: { ex?: number }): Promise<'OK'> {
    this.map.set(key, {
      value,
      expiresAtMs: opts?.ex !== undefined ? Date.now() + opts.ex * 1000 : null,
    });
    return 'OK';
  }
  async del(key: string): Promise<number> {
    return this.map.delete(key) ? 1 : 0;
  }
}

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    walletAddress: '0xwallet',
    env: { SESSION_ID: 's_test' },
    ...overrides,
  } as ToolContext;
}

describe('inference helpers (parity with engine compose-bundle.ts)', () => {
  describe('inferProducerOutputAsset', () => {
    it('swap_execute → input.to.toLowerCase()', () => {
      expect(inferProducerOutputAsset('swap_execute', { to: 'USDsui' })).toBe('usdsui');
      expect(inferProducerOutputAsset('swap_execute', { to: 'SUI' })).toBe('sui');
    });
    it('withdraw / borrow → input.asset.toLowerCase() (default usdc)', () => {
      expect(inferProducerOutputAsset('withdraw', { asset: 'USDC' })).toBe('usdc');
      expect(inferProducerOutputAsset('withdraw', { asset: 'USDsui' })).toBe('usdsui');
      expect(inferProducerOutputAsset('withdraw', {})).toBe('usdc');
      expect(inferProducerOutputAsset('borrow', { asset: 'USDsui' })).toBe('usdsui');
    });
    it('returns null for non-producer tools', () => {
      expect(inferProducerOutputAsset('send_transfer', {})).toBeNull();
      expect(inferProducerOutputAsset('save_deposit', {})).toBeNull();
      expect(inferProducerOutputAsset('claim_rewards', {})).toBeNull();
    });
    it('returns null for malformed input', () => {
      expect(inferProducerOutputAsset('swap_execute', null)).toBeNull();
      expect(inferProducerOutputAsset('swap_execute', { to: 123 })).toBeNull();
    });
  });

  describe('inferConsumerInputAsset', () => {
    it('send_transfer / save_deposit / repay_debt → asset (default usdc)', () => {
      expect(inferConsumerInputAsset('send_transfer', { asset: 'USDC' })).toBe('usdc');
      expect(inferConsumerInputAsset('save_deposit', { asset: 'USDsui' })).toBe('usdsui');
      expect(inferConsumerInputAsset('repay_debt', {})).toBe('usdc');
    });
    it('swap_execute → input.from.toLowerCase()', () => {
      expect(inferConsumerInputAsset('swap_execute', { from: 'USDC' })).toBe('usdc');
    });
    it('returns null for non-consumer tools', () => {
      expect(inferConsumerInputAsset('withdraw', {})).toBeNull();
      expect(inferConsumerInputAsset('borrow', {})).toBeNull();
    });
  });

  describe('shouldChainCoin', () => {
    it('true for whitelisted asset-aligned pair (withdraw_USDC → swap_USDC→USDsui)', () => {
      expect(
        shouldChainCoin(
          { name: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { name: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 3 } },
        ),
      ).toBe(true);
    });
    it('true for whitelisted asset-aligned pair (swap_USDC→USDsui → save_USDsui)', () => {
      expect(
        shouldChainCoin(
          { name: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 3 } },
          { name: 'save_deposit', input: { asset: 'USDsui' } },
        ),
      ).toBe(true);
    });
    it('false for non-whitelisted pair (swap_execute → swap_execute)', () => {
      expect(
        shouldChainCoin(
          { name: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 1 } },
          { name: 'swap_execute', input: { from: 'SUI', to: 'USDsui', amount: 1 } },
        ),
      ).toBe(false);
    });
    it('false when whitelisted but assets misaligned (withdraw_USDC → swap_SUI→...)', () => {
      expect(
        shouldChainCoin(
          { name: 'withdraw', input: { asset: 'USDC' } },
          { name: 'swap_execute', input: { from: 'SUI', to: 'USDC' } },
        ),
      ).toBe(false);
    });
  });
});

describe('summarizeBundle', () => {
  it('builds withdraw → send 1-line summary', () => {
    const s = summarizeBundle([
      { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
      { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' } },
    ]);
    expect(s).toContain('withdraw 3 USDC');
    expect(s).toContain('send 1 USDC');
    expect(s).toContain('→');
  });

  it('builds withdraw → swap → save 1-line summary', () => {
    const s = summarizeBundle([
      { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
      { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 3 } },
      { toolName: 'save_deposit', input: { asset: 'USDsui' } },
    ]);
    expect(s).toContain('withdraw 3 USDC');
    expect(s).toContain('swap 3 USDC → USDsui');
    expect(s).toContain('save');
  });
});

describe('audricPrepareBundleTool.call', () => {
  let redis: InMemoryRedis;
  // Specialise MockInstance to the function signature so `mock.calls`
  // is well-typed below. Avoids `any` while still surviving vitest's
  // contravariant `MockInstance<(this: unknown, ...args: unknown[])>`
  // generic.
  let writeSpy: MockInstance<typeof store.writeBundleProposal>;

  beforeEach(() => {
    redis = new InMemoryRedis();
    writeSpy = vi
      .spyOn(store, 'writeBundleProposal')
      .mockImplementation(async (sessionId: string, proposal: BundleProposal) => {
        await redis.set(`bundle:proposal:${sessionId}`, proposal, { ex: 60 });
      });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('happy path: 2-op whitelisted bundle stashes and returns ok=true', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' } },
        ],
      },
      makeContext(),
    );
    expect(result.data).toMatchObject({ ok: true, stepCount: 2 });
    expect((result.data as { bundleId: string }).bundleId).toMatch(/^[0-9a-f-]{36}$/);
    expect(writeSpy).toHaveBeenCalledOnce();
  });

  it('happy path: 3-op chain populates inputCoinFromStep on consumers', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 3 } },
          { toolName: 'save_deposit', input: { asset: 'USDsui' } },
        ],
      },
      makeContext(),
    );
    expect(result.data).toMatchObject({ ok: true, stepCount: 3, validatedChain: true });

    const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
    expect(stashed.steps[0].inputCoinFromStep).toBeUndefined();
    expect(stashed.steps[1].inputCoinFromStep).toBe(0);
    expect(stashed.steps[2].inputCoinFromStep).toBe(1);
  });

  it('respects an LLM-provided inputCoinFromStep (does not overwrite)', async () => {
    await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' }, inputCoinFromStep: 0 },
        ],
      },
      makeContext(),
    );
    const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
    expect(stashed.steps[1].inputCoinFromStep).toBe(0);
  });

  // [Phase 3a / 1.15.0] Pre-3a this returned `pair_not_whitelisted`.
  // Phase 3a permits the bundle (no envelope-level adjacency rejection);
  // chain-mode auto-population doesn't fire (assets misalign anyway —
  // step 0 outputs SUI, step 1 inputs SUI? actually they DO align, but
  // swap_execute→swap_execute isn't in VALID_PAIRS so chain-mode skips).
  // The bundle composes and runs wallet-mode for both swap legs. The
  // SDK's wallet-mode preflight surfaces NO_COINS_FOUND if the user
  // doesn't hold the input asset.
  it('Phase 3a accepts previously-rejected swap_execute → swap_execute (wallet-mode, no chain)', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 1 } },
          { toolName: 'swap_execute', input: { from: 'SUI', to: 'USDsui', amount: 1 } },
        ],
      },
      makeContext(),
    );
    expect(result.data).toMatchObject({ ok: true, stepCount: 2, validatedChain: false });
    const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
    expect(stashed.steps[0].inputCoinFromStep).toBeUndefined();
    expect(stashed.steps[1].inputCoinFromStep).toBeUndefined();
  });

  // [Phase 3a / P0-10] Zero-chain bundle: two independent sends.
  // Bundle composes; both legs run wallet-mode; atomic at the Payment Intent
  // level (both succeed or both revert).
  it('Phase 3a accepts zero-chain 2-op bundle (two independent sends — P0-10)', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 5, to: '0xalice' } },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 3, to: '0xbob' } },
        ],
      },
      makeContext(),
    );
    expect(result.data).toMatchObject({ ok: true, stepCount: 2, validatedChain: false });
    const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
    expect(stashed.steps[0].inputCoinFromStep).toBeUndefined();
    expect(stashed.steps[1].inputCoinFromStep).toBeUndefined();
  });

  // [Phase 3a / P0-10] Three independent sends inside one bundle.
  it('Phase 3a accepts zero-chain 3-op bundle (three independent sends)', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 5, to: '0xalice' } },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 3, to: '0xbob' } },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xcarol' } },
        ],
      },
      makeContext(),
    );
    expect(result.data).toMatchObject({ ok: true, stepCount: 3, validatedChain: false });
  });

  // [Phase 3a / P0-9] Partial-chain bundle: only one pair chains,
  // the rest run wallet-mode. The envelope still composes.
  it('Phase 3a accepts 3-op partial-chain (send → swap → save — only swap→save chains)', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xfirst' } },
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 5 } },
          { toolName: 'save_deposit', input: { asset: 'USDsui' } },
        ],
      },
      makeContext(),
    );
    expect(result.data).toMatchObject({ ok: true, stepCount: 3, validatedChain: true });
    const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
    expect(stashed.steps[0].inputCoinFromStep).toBeUndefined();
    expect(stashed.steps[1].inputCoinFromStep).toBeUndefined();
    expect(stashed.steps[2].inputCoinFromStep).toBe(1);
  });

  // [Phase 3a / P0-8] 4-op DAG: Demo 1 shape with one chained pair
  // mid-bundle. Activates when engine ≥1.15.0 (cap=4); skipped on
  // 1.14.0 because the cap rejects 4-op envelopes.
  it.skipIf(MAX_BUNDLE_OPS < 4)(
    'Phase 3a accepts 4-op DAG bundle (Demo 1: send + swap + save + send, only swap→save chains)',
    async () => {
      const result = await audricPrepareBundleTool.call!(
        {
          steps: [
            { toolName: 'send_transfer', input: { asset: 'USDC', amount: 5, to: '0xfirst' } },
            { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 10 } },
            { toolName: 'save_deposit', input: { asset: 'USDsui' } },
            { toolName: 'send_transfer', input: { asset: 'USDC', amount: 100, to: '0xlast' } },
          ],
        },
        makeContext(),
      );
      expect(result.data).toMatchObject({ ok: true, stepCount: 4, validatedChain: true });
      const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
      expect(stashed.steps[0].inputCoinFromStep).toBeUndefined();
      expect(stashed.steps[1].inputCoinFromStep).toBeUndefined();
      expect(stashed.steps[2].inputCoinFromStep).toBe(1);
      expect(stashed.steps[3].inputCoinFromStep).toBeUndefined();
    },
  );

  // [Phase 3a / P0-9] 4-op partial-chain: two chained pairs in a row
  // followed by an independent send. Activates at engine ≥1.15.0.
  it.skipIf(MAX_BUNDLE_OPS < 4)(
    'Phase 3a accepts 4-op partial-chain bundle (withdraw → swap → send chained, fourth send wallet-mode)',
    async () => {
      const result = await audricPrepareBundleTool.call!(
        {
          steps: [
            { toolName: 'withdraw', input: { asset: 'USDC', amount: 5 } },
            { toolName: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
            { toolName: 'send_transfer', input: { asset: 'SUI', amount: 5, to: '0xrecipient' } },
            { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xother' } },
          ],
        },
        makeContext(),
      );
      expect(result.data).toMatchObject({ ok: true, stepCount: 4, validatedChain: true });
      const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
      expect(stashed.steps[0].inputCoinFromStep).toBeUndefined();
      expect(stashed.steps[1].inputCoinFromStep).toBe(0);
      expect(stashed.steps[2].inputCoinFromStep).toBe(1);
      expect(stashed.steps[3].inputCoinFromStep).toBeUndefined();
    },
  );

  // [Phase 3a / P0-10] 4-op zero-chain bundle. Activates at engine ≥1.15.0.
  it.skipIf(MAX_BUNDLE_OPS < 4)(
    'Phase 3a accepts 4-op zero-chain bundle (four independent sends)',
    async () => {
      const result = await audricPrepareBundleTool.call!(
        {
          steps: [
            { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xa' } },
            { toolName: 'send_transfer', input: { asset: 'USDC', amount: 2, to: '0xb' } },
            { toolName: 'send_transfer', input: { asset: 'USDC', amount: 3, to: '0xc' } },
            { toolName: 'send_transfer', input: { asset: 'USDC', amount: 4, to: '0xd' } },
          ],
        },
        makeContext(),
      );
      expect(result.data).toMatchObject({ ok: true, stepCount: 4, validatedChain: false });
    },
  );

  it('rejects when sessionId missing in env', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' } },
        ],
      },
      makeContext({ env: {} }),
    );
    expect(result.data).toMatchObject({ ok: false, reason: 'no_session' });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('rejects when walletAddress missing', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { toolName: 'send_transfer', input: { asset: 'USDC', amount: 1, to: '0xdef' } },
        ],
      },
      makeContext({ walletAddress: undefined }),
    );
    expect(result.data).toMatchObject({ ok: false, reason: 'no_wallet' });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('does NOT chain when assets misaligned (withdraw_USDC → swap_SUI→...)', async () => {
    const result = await audricPrepareBundleTool.call!(
      {
        steps: [
          { toolName: 'withdraw', input: { asset: 'USDC', amount: 3 } },
          { toolName: 'swap_execute', input: { from: 'SUI', to: 'USDC', amount: 1 } },
        ],
      },
      makeContext(),
    );
    // Pair IS whitelisted (withdraw->swap_execute), assets ARE NOT aligned.
    // Tool accepts the bundle but skips inputCoinFromStep — wallet-mode
    // fallback kicks in at execute time (and likely fails because the
    // user holds zero SUI). Plan-time validation only checks structure.
    expect(result.data).toMatchObject({ ok: true, validatedChain: false });
    const stashed = writeSpy.mock.calls[0][1] as BundleProposal;
    expect(stashed.steps[1].inputCoinFromStep).toBeUndefined();
  });
});
