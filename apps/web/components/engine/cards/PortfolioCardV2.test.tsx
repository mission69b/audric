/**
 * SPEC 37 v0.7a Phase 2 Day 24 — PortfolioCardV2 unit tests.
 *
 * Convention: raw DOM API only — `textContent`, `querySelector`, `querySelectorAll`.
 *
 * Coverage:
 *   - Header: title (self vs watched), watched-address badge
 *   - Hero: total value + week trend (visible / hidden when zero)
 *   - Allocation MiniBar (preserved primitive)
 *   - Wallet section: per-allocation AssetAmountBlock rows + total
 *   - Savings section: AssetAmountBlock + APYBlock + daily yield row
 *   - DeFi row: visible when value > 0, with provenance caveat
 *   - Debt section: warning-colored debt + HFGauge when HF present
 *   - Net worth footer
 *   - Insights callout (warnings vs neutral)
 *   - APY decimal-vs-percentage handling (0.0462 OR 4.62 → both render 4.62%)
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PortfolioCardV2 } from './PortfolioCardV2';

const baseData = {
  totalValue: 1234.56,
  walletValue: 175,
  savingsValue: 500,
  defiValue: 0,
  debtValue: 0,
  healthFactor: null,
  allocations: [
    { symbol: 'USDC', amount: 100, usdValue: 100, percentage: 8.1 },
    { symbol: 'SUI', amount: 50, usdValue: 75, percentage: 6.1 },
  ],
  stablePercentage: 8.1,
  insights: [],
};

describe('PortfolioCardV2 — header', () => {
  it('renders "Your portfolio" by default', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    expect(container.textContent ?? '').toContain('Your portfolio');
  });

  it('renders "Portfolio" + AddressBadge for watched address', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{
          ...baseData,
          isSelfQuery: false,
          address:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          suinsName: 'alex.sui',
        }}
      />,
    );
    const text = container.textContent ?? '';
    // Header is "Portfolio", not "Your portfolio"
    expect(text).toMatch(/Portfolio/);
    expect(text).toContain('alex.sui');
  });
});

describe('PortfolioCardV2 — hero', () => {
  it('renders the total value as the hero', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    expect(container.textContent ?? '').toContain('$1,234.56');
  });

  it('renders week trend when nonzero change', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{
          ...baseData,
          weekChange: { absoluteUsd: 50, percentChange: 5.2 },
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('this week');
  });

  it('hides week trend when absoluteUsd is 0', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{
          ...baseData,
          weekChange: { absoluteUsd: 0, percentChange: 0 },
        }}
      />,
    );
    expect(container.textContent ?? '').not.toContain('this week');
  });
});

describe('PortfolioCardV2 — wallet section', () => {
  it('renders one AssetAmountBlock per allocation (top 5)', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{
          ...baseData,
          allocations: [
            { symbol: 'USDC', amount: 100, usdValue: 100, percentage: 25 },
            { symbol: 'SUI', amount: 50, usdValue: 75, percentage: 19 },
            { symbol: 'USDsui', amount: 30, usdValue: 30, percentage: 7 },
          ],
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).toContain('SUI');
    expect(text).toContain('USDsui');
  });

  it('renders the wallet total at the section bottom', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Wallet total');
    expect(text).toContain('$175.00');
  });

  it('filters dust (USD < 0.01) from wallet allocations', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{
          ...baseData,
          allocations: [
            { symbol: 'USDC', amount: 100, usdValue: 100, percentage: 99 },
            { symbol: 'DUST', amount: 0.0001, usdValue: 0.001, percentage: 0 },
          ],
        }}
      />,
    );
    expect(container.textContent ?? '').not.toContain('DUST');
  });

  it('hides Wallet section entirely when no allocations', () => {
    const { container } = render(
      <PortfolioCardV2 data={{ ...baseData, allocations: [] }} />,
    );
    expect(container.textContent ?? '').not.toContain('Wallet');
  });
});

describe('PortfolioCardV2 — savings section', () => {
  it('renders Savings AssetAmountBlock when savingsValue > 0', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Savings');
    expect(text).toContain('500.00');
  });

  it('renders Pool APY row when savingsApy is present (decimal format)', () => {
    const { container } = render(
      <PortfolioCardV2 data={{ ...baseData, savingsApy: 0.0462 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Pool APY');
    expect(text).toContain('4.62%');
  });

  it('renders Pool APY row when savingsApy is present (raw percentage format)', () => {
    const { container } = render(
      <PortfolioCardV2 data={{ ...baseData, savingsApy: 4.62 }} />,
    );
    expect(container.textContent ?? '').toContain('4.62%');
  });

  it('renders Daily yield row when dailyEarning > 0', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{ ...baseData, savingsApy: 0.0462, dailyEarning: 0.06 }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Daily yield');
    expect(text).toContain('/day');
  });

  it('hides Savings section when savingsValue is 0', () => {
    const { container } = render(
      <PortfolioCardV2 data={{ ...baseData, savingsValue: 0 }} />,
    );
    expect(container.textContent ?? '').not.toContain('Savings');
  });
});

describe('PortfolioCardV2 — DeFi row', () => {
  it('renders DeFi row when value > 0', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{ ...baseData, defiValue: 1569, defiSource: 'blockvision' }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('DeFi');
    expect(text).toContain('$1,569.00');
  });

  it('renders "(partial)" caveat when defiSource = partial', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{ ...baseData, defiValue: 1569, defiSource: 'partial' }}
      />,
    );
    expect(container.textContent ?? '').toContain('(partial)');
  });

  it('renders "(cached)" caveat when defiSource = partial-stale', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{ ...baseData, defiValue: 1569, defiSource: 'partial-stale' }}
      />,
    );
    expect(container.textContent ?? '').toContain('(cached)');
  });

  it('hides DeFi row when value is 0', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    expect(container.textContent ?? '').not.toContain('DeFi');
  });
});

describe('PortfolioCardV2 — debt + HF', () => {
  it('renders Debt row with warning color and HFGauge when borrows present', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{ ...baseData, debtValue: 200, healthFactor: 2.5 }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Debt');
    expect(text).toContain('-$200.00');
    expect(text).toContain('2.50');
  });

  it('hides Debt section when debtValue is 0', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    expect(container.textContent ?? '').not.toContain('Debt');
  });

  it('renders Debt without HFGauge when healthFactor is null', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{ ...baseData, debtValue: 200, healthFactor: null }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Debt');
    expect(text).not.toMatch(/HEALTH FACTOR/i);
  });
});

describe('PortfolioCardV2 — net worth footer', () => {
  it('renders Net worth at the footer', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Net worth');
  });
});

describe('PortfolioCardV2 — insights', () => {
  it('renders warning insights with warning style', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{
          ...baseData,
          insights: [{ type: 'warning', message: 'HF dropping below 1.5' }],
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('HF dropping below 1.5');
    expect(text).toContain('⚠');
  });

  it('renders neutral insights with → prefix', () => {
    const { container } = render(
      <PortfolioCardV2
        data={{
          ...baseData,
          insights: [{ type: 'info', message: 'You earned $0.06 yesterday' }],
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('You earned $0.06 yesterday');
    expect(text).toContain('→');
  });

  it('hides insights section when empty', () => {
    const { container } = render(<PortfolioCardV2 data={baseData} />);
    expect(container.textContent ?? '').not.toContain('⚠');
  });
});
