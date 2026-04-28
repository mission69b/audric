// ---------------------------------------------------------------------------
// Contract test — pins the canonical Portfolio shape against a fixed
// fixture so every adapter (API routes, hooks, engine tools, canvases,
// crons) can mock the same upstream and assert identical output. This
// is the regression net for the "single source of truth" rule:
//
//   - If you change the canonical shape, this test forces an update to
//     EXPECTED_CANONICAL in the fixture file. Every adapter test that
//     imports the fixture then breaks until they're updated in lockstep.
//   - If a future PR introduces a new adapter, drop a test here that
//     calls the adapter with the same fixtures and asserts equality
//     against EXPECTED_CANONICAL (or the relevant subset).
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@t2000/engine', () => ({
  fetchAddressPortfolio: vi.fn(),
  fetchAddressDefiPortfolio: vi.fn(),
  fetchTokenPrices: vi.fn(),
  // Side-effect import via `lib/portfolio.ts` → `init-engine-stores`.
  setDefiCacheStore: vi.fn(),
}));

vi.mock('@/lib/portfolio-data', () => ({
  fetchPositions: vi.fn(),
}));

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'https://fullnode.mainnet.sui.io:443',
}));

import { fetchAddressPortfolio, fetchAddressDefiPortfolio } from '@t2000/engine';
import { fetchPositions } from '@/lib/portfolio-data';
import { getPortfolio } from '../portfolio';
import {
  FIXTURE_ADDRESS,
  FIXTURE_BLOCKVISION_PORTFOLIO,
  FIXTURE_POSITIONS,
  FIXTURE_DEFI,
  EXPECTED_CANONICAL,
} from './portfolio-contract.fixture';

describe('portfolio contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAddressPortfolio).mockResolvedValue(FIXTURE_BLOCKVISION_PORTFOLIO);
    vi.mocked(fetchPositions).mockResolvedValue(FIXTURE_POSITIONS);
    vi.mocked(fetchAddressDefiPortfolio).mockResolvedValue(FIXTURE_DEFI);
  });

  it('canonical getPortfolio() matches the pinned EXPECTED_CANONICAL fixture', async () => {
    const portfolio = await getPortfolio(FIXTURE_ADDRESS);

    // Top-level scalar fields
    expect(portfolio.address).toBe(EXPECTED_CANONICAL.address);
    expect(portfolio.walletValueUsd).toBe(EXPECTED_CANONICAL.walletValueUsd);
    expect(portfolio.defiValueUsd).toBe(EXPECTED_CANONICAL.defiValueUsd);
    expect(portfolio.defiSource).toBe(EXPECTED_CANONICAL.defiSource);
    expect(portfolio.netWorthUsd).toBe(EXPECTED_CANONICAL.netWorthUsd);
    expect(portfolio.estimatedDailyYield).toBeCloseTo(EXPECTED_CANONICAL.estimatedDailyYield);
    expect(portfolio.source).toBe(EXPECTED_CANONICAL.source);
    expect(portfolio.pricedAt).toBe(EXPECTED_CANONICAL.pricedAt);

    // Wallet array round-trip (same coin types, in same order)
    expect(portfolio.wallet).toEqual(EXPECTED_CANONICAL.wallet);

    // Allocations map (per-symbol)
    expect(portfolio.walletAllocations).toEqual(EXPECTED_CANONICAL.walletAllocations);

    // Positions round-trip
    expect(portfolio.positions).toEqual(EXPECTED_CANONICAL.positions);
  });

  it('walletValueUsd is the SUM of every priced coin (not a stable-only sum)', async () => {
    const portfolio = await getPortfolio(FIXTURE_ADDRESS);

    // The bug we fixed: pre-rewrite, `totalUsd` was `USDC + USDsui` only,
    // missing the $30 of SUI in the fixture. Pin that the canonical
    // includes every priced coin.
    const expectedSum = FIXTURE_BLOCKVISION_PORTFOLIO.coins.reduce(
      (acc, c) => acc + (c.usdValue ?? 0),
      0,
    );
    expect(portfolio.walletValueUsd).toBe(expectedSum);
    expect(portfolio.walletValueUsd).toBe(100); // SUI 30 + USDC 50 + USDT 20
  });

  it('netWorthUsd accounts for wallet + savings + pendingRewards + DeFi - debt', async () => {
    const portfolio = await getPortfolio(FIXTURE_ADDRESS);
    // Pin the canonical formula. Mirrors `balance_check.total` in
    // `@t2000/engine`'s `tools/balance.ts`. If you change the
    // formula in either place you MUST change the other in lockstep
    // — the SSOT only buys us anything if both adapters compute
    // identically.
    expect(portfolio.netWorthUsd).toBe(
      portfolio.walletValueUsd
      + portfolio.positions.savings
      + portfolio.positions.pendingRewards
      + portfolio.defiValueUsd
      - portfolio.positions.borrows,
    );
  });

  it('netWorthUsd includes DeFi (regression: timeline canvas was missing $7,520 Bluefin/Suilend value for an external wallet)', async () => {
    const portfolio = await getPortfolio(FIXTURE_ADDRESS);
    // Pre-fix: 100 + 200 + 0.5 - 25 = 275.5 (DeFi silently dropped).
    // Post-fix: 100 + 200 + 0.5 + 50 - 25 = 325.5.
    expect(portfolio.netWorthUsd).toBe(325.5);
    expect(portfolio.netWorthUsd - portfolio.defiValueUsd).toBe(275.5);
  });

  it('defi degrades to zero with source="degraded" when fetcher throws', async () => {
    vi.mocked(fetchAddressDefiPortfolio).mockRejectedValueOnce(new Error('blockvision down'));
    const portfolio = await getPortfolio(FIXTURE_ADDRESS);
    expect(portfolio.defiValueUsd).toBe(0);
    expect(portfolio.defiSource).toBe('degraded');
    // Net worth still computes — DeFi just contributes 0.
    expect(portfolio.netWorthUsd).toBe(275.5);
  });

  it('walletAllocations aggregates by symbol, not coin type', async () => {
    const portfolio = await getPortfolio(FIXTURE_ADDRESS);
    expect(portfolio.walletAllocations).toEqual({
      SUI: 12.5,
      USDC: 50,
      USDT: 20,
    });
  });

  // ---------------------------------------------------------------------
  // PLACEHOLDER for future adapters: API routes, useBalance, engine tools.
  // After Phase 2 ships, add tests here that mock the underlying canonical
  // and verify each adapter's wire shape. Example:
  //
  //   it('GET /api/portfolio matches canonical', async () => {
  //     const res = await GET(new NextRequest(`http://x?address=${FIXTURE_ADDRESS}`));
  //     const body = await res.json();
  //     expect(body.netWorthUsd).toBe(EXPECTED_CANONICAL.netWorthUsd);
  //     ...
  //   });
  //
  // The shape contract guarantees that as long as every adapter goes
  // through getPortfolio(), the numbers match by construction.
  // ---------------------------------------------------------------------
});
