/**
 * SPEC 23B-polish — PortfolioCard render tests.
 *
 * Covers:
 *   - hero total + week-trend render
 *   - Wallet/Savings/DeFi/Debt rows render with correct USD
 *   - sub-cent daily earning floors to "< $0.01" via shared fmtYield
 *     (regression guard — pre-fix rendered "$0.0000/day")
 *   - DeFi `(partial)` / `(cached)` warning chips render on degraded source
 *   - HF gauge + StatusBadge render when debt > 0
 *   - watched-address badge renders when isSelfQuery === false
 *   - insights callout renders warnings + tips
 *
 * Convention: per `BalanceCard.test.tsx`, this codebase does NOT extend
 * `@testing-library/jest-dom` matchers. Tests use raw DOM API.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PortfolioCard } from './PortfolioCard';

const baseData = {
  totalValue: 100.26,
  walletValue: 77.44,
  savingsValue: 22.75,
  debtValue: 0,
  healthFactor: null,
  allocations: [
    { symbol: 'SUI', amount: 19.81, usdValue: 25.97, percentage: 25 },
    { symbol: 'USDsui', amount: 22.86, usdValue: 22.88, percentage: 23 },
    { symbol: 'USDC', amount: 13.72, usdValue: 13.71, percentage: 14 },
    { symbol: 'MANIFEST', amount: 3842.62, usdValue: 4.89, percentage: 5 },
  ],
  stablePercentage: 37,
  insights: [],
};

describe('PortfolioCard', () => {
  it('renders the hero total + breakdown rows', () => {
    render(<PortfolioCard data={baseData} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('$100.26');
    expect(text).toContain('Wallet');
    expect(text).toContain('$77.44');
    expect(text).toContain('Savings');
    expect(text).toContain('$22.75');
    expect(text).toContain('Net Worth');
  });

  it('renders the week-change trend chip when non-zero', () => {
    render(
      <PortfolioCard
        data={{ ...baseData, weekChange: { absoluteUsd: 3.01, percentChange: 3.1 } }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('this week');
    expect(text).toMatch(/\+?3\.1%/);
  });

  it('renders Savings APY + daily yield when both present', () => {
    render(
      <PortfolioCard
        data={{ ...baseData, savingsApy: 0.0754, dailyEarning: 0.005 }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('7.54% APY');
  });

  // [SPEC 23B-polish, 2026-05-11] Regression guard for sub-cent floor.
  // Pre-fix this rendered "· $0.0000/day" because the inline toFixed(4)
  // wasn't using the shared fmtYield helper. Must now show "< $0.01/day".
  it('floors sub-cent daily earnings on the Savings row to "< $0.01/day"', () => {
    render(
      <PortfolioCard
        data={{
          ...baseData,
          savingsApy: 0.0421,
          // tiny daily yield → fmtUsd → "0.00" → fmtYield triggers floor
          dailyEarning: 0.0000412,
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('< $0.01/day');
    expect(text).not.toContain('$0.0000/day');
  });

  it('renders DeFi row with (partial) chip when source is partial', () => {
    render(
      <PortfolioCard
        data={{ ...baseData, defiValue: 1500.0, defiSource: 'partial' }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('DeFi');
    expect(text).toContain('$1,500.00');
    expect(text).toContain('(partial)');
  });

  it('renders DeFi row with (cached) chip when source is partial-stale', () => {
    render(
      <PortfolioCard
        data={{ ...baseData, defiValue: 1500.0, defiSource: 'partial-stale' }}
      />,
    );
    expect(document.body.textContent).toContain('(cached)');
  });

  it('does not render DeFi row when defiValue === 0 (or absent)', () => {
    render(<PortfolioCard data={baseData} />);
    expect(document.body.textContent).not.toContain('DeFi');
  });

  it('renders Debt + HF gauge when debt > 0', () => {
    render(
      <PortfolioCard data={{ ...baseData, debtValue: 12.5, healthFactor: 1.42 }} />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('Debt');
    expect(text).toContain('-$12.50');
    expect(text).toContain('HF 1.42');
  });

  it('omits HF gauge when healthFactor is null even with debt', () => {
    render(
      <PortfolioCard data={{ ...baseData, debtValue: 12.5, healthFactor: null }} />,
    );
    expect(document.body.textContent).not.toMatch(/HF \d/);
  });

  it('renders watched-address badge with title "Portfolio" (not "Your Portfolio")', () => {
    render(
      <PortfolioCard
        data={{
          ...baseData,
          isSelfQuery: false,
          address: '0xa3f9b27c0000000000000000000000000000000000000000000000000000abcd',
          suinsName: 'alex.sui',
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('Portfolio');
    expect(text).not.toContain('Your Portfolio');
    expect(text).toContain('alex.sui');
  });

  it('renders insights callout when insights present', () => {
    render(
      <PortfolioCard
        data={{
          ...baseData,
          insights: [
            { type: 'tip', message: '$13.73 USDC idle in wallet. Deposit into NAVI.' },
            { type: 'warning', message: 'Health factor approaching liquidation threshold.' },
          ],
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('USDC idle');
    expect(text).toContain('Health factor approaching');
  });
});
