import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@t2000/engine', () => ({
  fetchAddressPortfolio: vi.fn(),
  fetchAddressDefiPortfolio: vi.fn().mockResolvedValue({
    totalUsd: 0,
    perProtocol: {},
    pricedAt: Date.now(),
    source: 'degraded',
  }),
  fetchTokenPrices: vi.fn(),
  // Side-effect import in `lib/portfolio.ts` calls `setDefiCacheStore`
  // via `./engine/init-engine-stores`. Provide a no-op so the mock
  // satisfies the import; the test doesn't exercise cache wiring.
  setDefiCacheStore: vi.fn(),
}));

vi.mock('@/lib/portfolio-data', () => ({
  fetchPositions: vi.fn(),
}));

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'https://fullnode.mainnet.sui.io:443',
}));

import { fetchAddressPortfolio, fetchAddressDefiPortfolio, fetchTokenPrices } from '@t2000/engine';
import { fetchPositions } from '@/lib/portfolio-data';
import { getPortfolio, getWalletSnapshot, getTokenPrices, prewarmPortfolio } from '../portfolio';

// Default DeFi mock for every test in this file. Tests that care about
// DeFi behavior override per-case via `mockResolvedValueOnce` /
// `mockRejectedValueOnce`. Without this, `vi.clearAllMocks()` in the
// nested `beforeEach`s strips the factory-level default and the mock
// returns `undefined`, crashing `getPortfolio` when it tries to read
// `defi.totalUsd` on the resolved value.
const defaultDefiSummary = {
  totalUsd: 0,
  perProtocol: {},
  pricedAt: Date.now(),
  source: 'degraded' as const,
};

const SUI_TYPE = '0x2::sui::SUI';
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

describe('getPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAddressDefiPortfolio).mockResolvedValue(defaultDefiSummary);
  });

  it('combines BlockVision wallet + protocol positions into one canonical shape', async () => {
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [
        { coinType: SUI_TYPE, symbol: 'SUI', decimals: 9, balance: '10000000000', price: 2.5, usdValue: 25 },
        { coinType: USDC_TYPE, symbol: 'USDC', decimals: 6, balance: '50000000', price: 1, usdValue: 50 },
      ],
      totalUsd: 75,
      pricedAt: 1700000000000,
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockResolvedValue({
      savings: 100,
      borrows: 0,
      savingsRate: 0.05,
      healthFactor: null,
      maxBorrow: 80,
      pendingRewards: 0,
      supplies: [{ asset: 'USDC', amount: 100, amountUsd: 100, apy: 0.05, protocol: 'NAVI', protocolId: 'navi' }],
      borrowsDetail: [],
    });

    const portfolio = await getPortfolio('0xabc');

    expect(portfolio.address).toBe('0xabc');
    expect(portfolio.walletValueUsd).toBe(75);
    expect(portfolio.netWorthUsd).toBe(175);
    expect(portfolio.estimatedDailyYield).toBeCloseTo(100 * 0.05 / 365);
    expect(portfolio.walletAllocations.SUI).toBe(10);
    expect(portfolio.walletAllocations.USDC).toBe(50);
    expect(portfolio.positions.savings).toBe(100);
    expect(portfolio.source).toBe('blockvision');
  });

  it('subtracts borrows from net worth', async () => {
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [],
      totalUsd: 200,
      pricedAt: 1700000000000,
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockResolvedValue({
      savings: 500,
      borrows: 100,
      savingsRate: 0.05,
      healthFactor: 4.5,
      maxBorrow: 400,
      pendingRewards: 0,
      supplies: [],
      borrowsDetail: [{ asset: 'USDC', amount: 100, amountUsd: 100, apy: 0.07, protocol: 'NAVI', protocolId: 'navi' }],
    });

    const portfolio = await getPortfolio('0xabc');
    expect(portfolio.netWorthUsd).toBe(600);
    expect(portfolio.positions.healthFactor).toBe(4.5);
  });

  it('degrades to empty defaults when wallet fetch rejects', async () => {
    vi.mocked(fetchAddressPortfolio).mockRejectedValue(new Error('blockvision timeout'));
    vi.mocked(fetchPositions).mockResolvedValue({
      savings: 50,
      borrows: 0,
      savingsRate: 0.04,
      healthFactor: null,
      maxBorrow: 0,
      pendingRewards: 0,
      supplies: [],
      borrowsDetail: [],
    });

    const portfolio = await getPortfolio('0xabc');
    expect(portfolio.walletValueUsd).toBe(0);
    expect(portfolio.netWorthUsd).toBe(50);
    expect(portfolio.source).toBe('sui-rpc-degraded');
  });

  it('degrades to empty positions when registry fetch rejects', async () => {
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [],
      totalUsd: 42,
      pricedAt: 1700000000000,
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockRejectedValue(new Error('registry boom'));

    const portfolio = await getPortfolio('0xabc');
    expect(portfolio.walletValueUsd).toBe(42);
    expect(portfolio.positions.savings).toBe(0);
    expect(portfolio.positions.borrows).toBe(0);
    expect(portfolio.netWorthUsd).toBe(42);
  });

  it('aggregates allocations by symbol when multiple coins share a symbol', async () => {
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [
        { coinType: USDC_TYPE, symbol: 'USDC', decimals: 6, balance: '10000000', price: 1, usdValue: 10 },
        { coinType: '0xother::usdc::USDC', symbol: 'USDC', decimals: 6, balance: '5000000', price: 1, usdValue: 5 },
      ],
      totalUsd: 15,
      pricedAt: 1700000000000,
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockResolvedValue({
      savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
      maxBorrow: 0, pendingRewards: 0, supplies: [], borrowsDetail: [],
    });

    const portfolio = await getPortfolio('0xabc');
    expect(portfolio.walletAllocations.USDC).toBe(15);
  });
});

describe('getWalletSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns wallet-only data without calling fetchPositions', async () => {
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [{ coinType: USDC_TYPE, symbol: 'USDC', decimals: 6, balance: '5000000', price: 1, usdValue: 5 }],
      totalUsd: 5,
      pricedAt: 1700000000000,
      source: 'blockvision',
    });

    const snapshot = await getWalletSnapshot('0xabc');
    expect(snapshot.totalUsd).toBe(5);
    expect(snapshot.allocations.USDC).toBe(5);
    expect(fetchPositions).not.toHaveBeenCalled();
  });
});

describe('getTokenPrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to engine fetchTokenPrices', async () => {
    vi.mocked(fetchTokenPrices).mockResolvedValue({
      [SUI_TYPE]: { price: 2.5 },
      [USDC_TYPE]: { price: 1 },
    });

    const prices = await getTokenPrices([SUI_TYPE, USDC_TYPE]);
    expect(prices[SUI_TYPE].price).toBe(2.5);
    expect(prices[USDC_TYPE].price).toBe(1);
    // The second arg is the BLOCKVISION_API_KEY env var captured at module
    // import time. In CI / clean dev shells it's `undefined`; on machines
    // that have the var set to empty string `""` (e.g. a botched `.env.local`
    // entry — exactly the bug we're regressing against here) the mock sees
    // `""`. Both flow through `fetchTokenPrices` to the same degraded path,
    // so the contract this test guards is "first arg is the coin list" —
    // the second arg's exact identity is environment-dependent.
    expect(fetchTokenPrices).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetchTokenPrices).mock.calls[0];
    expect(call[0]).toEqual([SUI_TYPE, USDC_TYPE]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// [SPEC 22.3 — 2026-05-10] In-flight Promise dedup + prewarmPortfolio
//
// The chat / resume routes call `prewarmPortfolio(address)` early (right
// after auth) so the heavy portfolio fan-out runs in parallel with the
// serial Prisma + session-store work that previously happened first.
// `engine-factory.ts` then calls `getPortfolio(address)` itself a few
// hundred ms later; this dedup map ensures that second call returns the
// SAME in-flight Promise instead of firing a duplicate set of sub-fetches.
//
// Pin:
//   - Concurrent calls share a single underlying fetch.
//   - Sequential calls (after first resolves) DO fire fresh sub-fetches
//     — the dedup is strictly request-collapsing, not caching. Underlying
//     sub-fetchers own their own caches.
//   - A failed first call clears the inflight slot, so subsequent calls
//     don't inherit the rejection.
//   - Different addresses don't share Promises.
// ───────────────────────────────────────────────────────────────────────

describe('getPortfolio in-flight dedup (SPEC 22.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAddressDefiPortfolio).mockResolvedValue(defaultDefiSummary);
  });

  function setupResolvers() {
    let resolveWallet!: () => void;
    let resolvePositions!: () => void;
    vi.mocked(fetchAddressPortfolio).mockImplementation(
      () =>
        new Promise((res) => {
          resolveWallet = () =>
            res({
              coins: [],
              totalUsd: 0,
              pricedAt: Date.now(),
              source: 'blockvision',
            });
        }),
    );
    vi.mocked(fetchPositions).mockImplementation(
      () =>
        new Promise((res) => {
          resolvePositions = () =>
            res({
              savings: 0,
              borrows: 0,
              savingsRate: 0,
              healthFactor: null,
              maxBorrow: 0,
              pendingRewards: 0,
              supplies: [],
              borrowsDetail: [],
            });
        }),
    );
    return {
      resolveAll: () => {
        resolveWallet();
        resolvePositions();
      },
    };
  }

  it('concurrent calls for the same address share one underlying fetch', async () => {
    const { resolveAll } = setupResolvers();

    const p1 = getPortfolio('0xshared');
    const p2 = getPortfolio('0xshared');
    const p3 = getPortfolio('0xshared');

    // All three Promise references are === before any resolve.
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);

    resolveAll();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Each sub-fetcher invoked exactly once even though three callers
    // requested the portfolio.
    expect(fetchAddressPortfolio).toHaveBeenCalledTimes(1);
    expect(fetchPositions).toHaveBeenCalledTimes(1);
    expect(fetchAddressDefiPortfolio).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('sequential calls (after first resolves) fire fresh sub-fetches', async () => {
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [],
      totalUsd: 0,
      pricedAt: Date.now(),
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockResolvedValue({
      savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
      maxBorrow: 0, pendingRewards: 0, supplies: [], borrowsDetail: [],
    });

    await getPortfolio('0xseq');
    await getPortfolio('0xseq');

    // Second call: the inflight slot was cleared on first resolution,
    // so we re-enter the underlying fetchers (which own their own
    // caches downstream — this layer doesn't cache results).
    expect(fetchAddressPortfolio).toHaveBeenCalledTimes(2);
    expect(fetchPositions).toHaveBeenCalledTimes(2);
  });

  it('different addresses get independent in-flight Promises', async () => {
    // Use immediately-resolving mocks so we don't have to thread per-
    // address resolver captures (the closure-based setupResolvers
    // helper above would have the second mockImplementation overwrite
    // the first's resolver capture and one of the Promises would hang).
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [],
      totalUsd: 0,
      pricedAt: Date.now(),
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockResolvedValue({
      savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
      maxBorrow: 0, pendingRewards: 0, supplies: [], borrowsDetail: [],
    });

    const p1 = getPortfolio('0xaaa');
    const p2 = getPortfolio('0xbbb');

    expect(p1).not.toBe(p2);
    await Promise.all([p1, p2]);

    // Each address triggered its own pair of sub-fetcher calls.
    expect(fetchAddressPortfolio).toHaveBeenCalledTimes(2);
    expect(fetchPositions).toHaveBeenCalledTimes(2);
  });

  it('a rejected first call does NOT poison the next call', async () => {
    // First call: BOTH sub-fetchers fail. getPortfolio still resolves
    // with degraded data because each sub-fetch has its own .catch.
    vi.mocked(fetchAddressPortfolio).mockRejectedValueOnce(new Error('boom'));
    vi.mocked(fetchPositions).mockRejectedValueOnce(new Error('boom'));
    const r1 = await getPortfolio('0xfail');
    expect(r1.walletValueUsd).toBe(0);

    // Second call: sub-fetchers resolve. We MUST get fresh data —
    // the inflight slot was cleared on the first resolve so the next
    // getPortfolio doesn't re-use the (now-resolved) prior Promise.
    vi.mocked(fetchAddressPortfolio).mockResolvedValueOnce({
      coins: [],
      totalUsd: 999,
      pricedAt: Date.now(),
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockResolvedValueOnce({
      savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
      maxBorrow: 0, pendingRewards: 0, supplies: [], borrowsDetail: [],
    });
    const r2 = await getPortfolio('0xfail');
    expect(r2.walletValueUsd).toBe(999);
  });
});

describe('prewarmPortfolio (SPEC 22.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAddressDefiPortfolio).mockResolvedValue(defaultDefiSummary);
    vi.mocked(fetchAddressPortfolio).mockResolvedValue({
      coins: [],
      totalUsd: 100,
      pricedAt: Date.now(),
      source: 'blockvision',
    });
    vi.mocked(fetchPositions).mockResolvedValue({
      savings: 0, borrows: 0, savingsRate: 0, healthFactor: null,
      maxBorrow: 0, pendingRewards: 0, supplies: [], borrowsDetail: [],
    });
  });

  it('returns synchronously (void) without throwing', () => {
    expect(() => prewarmPortfolio('0xprewarm')).not.toThrow();
  });

  it('starts the fetch eagerly so a subsequent getPortfolio dedups onto the in-flight call', async () => {
    prewarmPortfolio('0xprewarm');

    // The prewarm has already fired the underlying fetches by the
    // microtask after this synchronous call returns. Awaiting any
    // resolved/pending promise here flushes the queue.
    await Promise.resolve();

    // Subsequent real call from engine-factory.
    const portfolio = await getPortfolio('0xprewarm');
    expect(portfolio.walletValueUsd).toBe(100);

    // Most importantly: the underlying sub-fetchers were each called
    // exactly ONCE. Without dedup, prewarm + getPortfolio would each
    // fire their own pair → 2× wallet, 2× positions, 2× defi.
    expect(fetchAddressPortfolio).toHaveBeenCalledTimes(1);
    expect(fetchPositions).toHaveBeenCalledTimes(1);
    expect(fetchAddressDefiPortfolio).toHaveBeenCalledTimes(1);
  });

  it('does not throw or unhandled-reject when the prewarmed fetch fails', async () => {
    vi.mocked(fetchAddressPortfolio).mockRejectedValueOnce(new Error('blockvision down'));
    vi.mocked(fetchPositions).mockRejectedValueOnce(new Error('navi down'));

    prewarmPortfolio('0xfailprewarm');

    // Drain the microtask queue. The .catch in prewarm's body MUST
    // swallow the rejection. If it didn't, vitest would surface an
    // unhandled-rejection warning AND the test runner would fail.
    await new Promise((r) => setTimeout(r, 0));

    // The subsequent real getPortfolio call DOES surface degraded
    // data (because each sub-fetch has its own .catch), proving the
    // failed prewarm didn't poison anything.
    //
    // Note: the failed prewarm already cleared the inflight slot, so
    // this getPortfolio call fires FRESH sub-fetches with the next
    // mocked values (the resolved defaults from beforeEach).
    const portfolio = await getPortfolio('0xfailprewarm');
    expect(portfolio).toBeDefined();
    expect(portfolio.walletValueUsd).toBe(100);
  });

  it('safe to call multiple times for the same address (second call dedups)', async () => {
    prewarmPortfolio('0xtwice');
    prewarmPortfolio('0xtwice');
    prewarmPortfolio('0xtwice');

    await Promise.resolve();
    const portfolio = await getPortfolio('0xtwice');
    expect(portfolio.walletValueUsd).toBe(100);
    expect(fetchAddressPortfolio).toHaveBeenCalledTimes(1);
  });
});
