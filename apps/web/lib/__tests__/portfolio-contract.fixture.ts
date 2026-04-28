// ---------------------------------------------------------------------------
// Shared fixture for the portfolio-contract test. Imported by every
// adapter test (API routes, hooks, engine tool wrappers, canvas
// fetchers) to assert that they all produce IDENTICAL output for the
// same upstream inputs. If you change the canonical shape, update
// here and every adapter must update in lockstep.
// ---------------------------------------------------------------------------

import type { AddressPortfolio, DefiSummary } from '@t2000/engine';
import type { Portfolio, PositionSummary } from '@/lib/portfolio';

export const FIXTURE_ADDRESS = '0xc0ffeeC0FFEEc0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0001';

export const FIXTURE_BLOCKVISION_PORTFOLIO: AddressPortfolio = {
  coins: [
    {
      coinType: '0x2::sui::SUI',
      symbol: 'SUI',
      decimals: 9,
      balance: '12500000000', // 12.5 SUI
      price: 2.4,
      usdValue: 30,
    },
    {
      coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      symbol: 'USDC',
      decimals: 6,
      balance: '50000000', // 50 USDC
      price: 1,
      usdValue: 50,
    },
    {
      coinType: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
      symbol: 'USDT',
      decimals: 6,
      balance: '20000000', // 20 USDT
      price: 1,
      usdValue: 20,
    },
  ],
  totalUsd: 100,
  pricedAt: 1745800000000,
  source: 'blockvision',
};

export const FIXTURE_POSITIONS: PositionSummary = {
  savings: 200,
  borrows: 25,
  savingsRate: 0.05,
  healthFactor: 8,
  maxBorrow: 160,
  pendingRewards: 0.5,
  supplies: [
    { asset: 'USDC', amount: 200, amountUsd: 200, apy: 0.05, protocol: 'NAVI', protocolId: 'navi' },
  ],
  borrowsDetail: [
    { asset: 'USDC', amount: 25, amountUsd: 25, apy: 0.07, protocol: 'NAVI', protocolId: 'navi' },
  ],
};

/**
 * BlockVision DeFi positions outside NAVI (Bluefin, Suilend, Cetus,
 * Aftermath, Volo, Walrus). Pinned at $50 here so the contract test
 * verifies that the canonical formula counts DeFi in net worth — the
 * regression that the timeline canvas missed and that landed an
 * external wallet at $29,672 instead of the live $37,192 reported by
 * `balance_check`.
 */
export const FIXTURE_DEFI: DefiSummary = {
  totalUsd: 50,
  perProtocol: { bluefin: 30, suilend: 20 },
  pricedAt: FIXTURE_BLOCKVISION_PORTFOLIO.pricedAt,
  source: 'blockvision',
};

/**
 * The expected canonical Portfolio for the fixtures above. Every
 * adapter that surfaces portfolio data MUST produce these numbers
 * exactly when fed the fixtures.
 */
export const EXPECTED_CANONICAL: Portfolio = {
  address: FIXTURE_ADDRESS,
  wallet: FIXTURE_BLOCKVISION_PORTFOLIO.coins,
  walletValueUsd: 100,
  walletAllocations: {
    SUI: 12.5,
    USDC: 50,
    USDT: 20,
  },
  positions: FIXTURE_POSITIONS,
  defiValueUsd: 50,
  defiSource: 'blockvision',
  // 100 (wallet) + 200 (savings) + 0.5 (rewards) + 50 (defi) - 25 (debt) = 325.5
  // This matches `balance_check.total = availableUsd + savings + gasReserve
  // + pendingRewards + defi - debt` byte-for-byte.
  netWorthUsd: 325.5,
  estimatedDailyYield: (200 * 0.05) / 365,
  source: 'blockvision',
  pricedAt: FIXTURE_BLOCKVISION_PORTFOLIO.pricedAt,
};
