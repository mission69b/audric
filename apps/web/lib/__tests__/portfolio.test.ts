import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@t2000/engine', () => ({
  fetchAddressPortfolio: vi.fn(),
  fetchTokenPrices: vi.fn(),
}));

vi.mock('@/lib/portfolio-data', () => ({
  fetchPositions: vi.fn(),
}));

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'https://fullnode.mainnet.sui.io:443',
}));

import { fetchAddressPortfolio, fetchTokenPrices } from '@t2000/engine';
import { fetchPositions } from '@/lib/portfolio-data';
import { getPortfolio, getWalletSnapshot, getTokenPrices } from '../portfolio';

const SUI_TYPE = '0x2::sui::SUI';
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

describe('getPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
