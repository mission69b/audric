/**
 * SPEC 37 v0.7a Phase 2 Day 10-11 — BalanceCardV2 unit tests.
 *
 * Convention (per BalanceCard.test.tsx, ConfirmationChip.test.tsx):
 * raw DOM API only — `textContent`, `querySelector`. No jest-dom matchers.
 *
 * Coverage:
 *   - Wallet section: empty, single holding, multiple holdings, sort + cap
 *   - Savings section: hidden when 0 + no saveable, shown when deposits > 0,
 *     APY hint shown when no deposits but saveable USDC/USDsui present
 *   - Debt: hidden when 0, shown when > 0
 *   - Footer total: derived from total field OR computed from parts
 *   - Watched-address badge: shown when isSelfQuery=false + address present
 *   - APY override props
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BalanceCardV2, type BalanceCardV2Data } from './BalanceCardV2';

const baseData: BalanceCardV2Data = {
  total: 100.26,
  available: 77.51,
  savings: 22.75,
  debt: 0,
  defi: 0,
  defiSource: 'blockvision',
  holdings: [
    { symbol: 'SUI', balance: 19.8073, usdValue: 25.97 },
    { symbol: 'USDsui', balance: 22.8633, usdValue: 22.88 },
    { symbol: 'USDC', balance: 13.721, usdValue: 13.71 },
    { symbol: 'MANIFEST', balance: 3842.6252, usdValue: 4.89 },
  ],
};

describe('BalanceCardV2 — wallet section', () => {
  it('renders the "Wallet & savings" header chrome', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    expect(container.textContent).toContain('Wallet & savings');
  });

  it('renders a wallet section with each holding as an AssetAmountBlock', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Wallet');
    expect(text).toContain('SUI');
    expect(text).toContain('USDsui');
    expect(text).toContain('USDC');
    expect(text).toContain('MANIFEST');
  });

  it('renders the wallet USD subtotal next to the section label', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    expect(container.textContent).toContain('$77.51');
  });

  it('sorts holdings by USD value descending', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    const suiIdx = text.indexOf('SUI');
    const usdsuiIdx = text.indexOf('USDsui');
    const manifestIdx = text.indexOf('MANIFEST');
    // SUI ($25.97) > USDsui ($22.88) > USDC ($13.71) > MANIFEST ($4.89)
    expect(suiIdx).toBeLessThan(usdsuiIdx);
    expect(usdsuiIdx).toBeLessThan(manifestIdx);
  });

  it('caps wallet section at 6 visible holdings', () => {
    const manyHoldings: BalanceCardV2Data = {
      ...baseData,
      holdings: Array.from({ length: 10 }, (_, i) => ({
        symbol: `TOK${i}`,
        balance: 100 - i,
        usdValue: 100 - i,
      })),
    };
    const { container } = render(<BalanceCardV2 data={manyHoldings} />);
    const text = container.textContent ?? '';
    expect(text).toContain('TOK0');
    expect(text).toContain('TOK5');
    expect(text).not.toContain('TOK6');
    expect(text).not.toContain('TOK9');
  });

  it('filters holdings under $0.01', () => {
    const dustHoldings: BalanceCardV2Data = {
      ...baseData,
      holdings: [
        { symbol: 'SUI', balance: 1, usdValue: 1 },
        { symbol: 'DUST', balance: 0.001, usdValue: 0.001 },
      ],
    };
    const { container } = render(<BalanceCardV2 data={dustHoldings} />);
    expect(container.textContent).toContain('SUI');
    expect(container.textContent).not.toContain('DUST');
  });

  it('renders "No holdings" when wallet is empty', () => {
    const empty: BalanceCardV2Data = { ...baseData, holdings: [] };
    const { container } = render(<BalanceCardV2 data={empty} />);
    expect(container.textContent).toContain('No holdings');
  });
});

describe('BalanceCardV2 — savings section', () => {
  it('renders savings section with deposit row when savings > 0', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('NAVI savings');
    expect(text).toContain('Total deposited');
    expect(text).toContain('$22.75');
  });

  it('does not render savings section when savings=0 + no saveable', () => {
    const noSavings: BalanceCardV2Data = {
      ...baseData,
      savings: 0,
      saveableUsdc: 0,
      saveableUsdsui: 0,
    };
    const { container } = render(<BalanceCardV2 data={noSavings} />);
    expect(container.textContent).not.toContain('NAVI savings');
  });

  it('renders APY hint when savings=0 but USDC saveable', () => {
    const saveable: BalanceCardV2Data = {
      ...baseData,
      savings: 0,
      saveableUsdc: 13.72,
      saveableUsdsui: 0,
      // Wipe holdings to isolate the savings-section assertion (the
      // baseData fixture includes a USDsui wallet holding which would
      // otherwise mask the "USDsui APY hint not rendered" check).
      holdings: [{ symbol: 'USDC', balance: 13.721, usdValue: 13.71 }],
    };
    const { container } = render(<BalanceCardV2 data={saveable} />);
    const text = container.textContent ?? '';
    expect(text).toContain('NAVI savings');
    expect(text).toContain('Saveable');
    expect(text).toContain('USDC');
    expect(text).toContain('4.62%');
    expect(text).not.toContain('USDsui');
  });

  it('renders APY hint for both stables when both saveable', () => {
    const both: BalanceCardV2Data = {
      ...baseData,
      savings: 0,
      saveableUsdc: 13.72,
      saveableUsdsui: 22.86,
    };
    const { container } = render(<BalanceCardV2 data={both} />);
    const text = container.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).toContain('4.62%');
    expect(text).toContain('USDsui');
    expect(text).toContain('5.20%');
  });

  it('honors APY override props', () => {
    const saveable: BalanceCardV2Data = {
      ...baseData,
      savings: 0,
      saveableUsdc: 13.72,
      saveableUsdsui: 0,
    };
    const { container } = render(
      <BalanceCardV2 data={saveable} defaultUsdcApyBps={580} />,
    );
    expect(container.textContent).toContain('5.80%');
  });

  it('does not render APY hint when user already has deposits', () => {
    const withDeposits: BalanceCardV2Data = {
      ...baseData,
      savings: 22.75,
      saveableUsdc: 13.72,
    };
    const { container } = render(<BalanceCardV2 data={withDeposits} />);
    expect(container.textContent).not.toContain('Saveable');
  });
});

describe('BalanceCardV2 — debt + footer', () => {
  it('hides debt section when debt is 0', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    expect(container.textContent).not.toContain('Debt');
  });

  it('renders debt with warning color when > 0', () => {
    const withDebt: BalanceCardV2Data = { ...baseData, debt: 12.5 };
    const { container } = render(<BalanceCardV2 data={withDebt} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Debt');
    expect(text).toContain('$12.50');
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('renders the footer total from the data.total field', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    expect(container.textContent).toContain('Total');
    expect(container.textContent).toContain('$100.26');
  });

  it('computes the footer total when data.total is missing', () => {
    const noTotal: BalanceCardV2Data = {
      available: 50,
      savings: 25,
      defi: 0,
      debt: 0,
      holdings: [],
    };
    const { container } = render(<BalanceCardV2 data={noTotal} />);
    expect(container.textContent).toContain('$75.00');
  });

  it('subtracts debt from the computed total', () => {
    const withDebt: BalanceCardV2Data = {
      available: 100,
      savings: 0,
      defi: 0,
      debt: 30,
      holdings: [],
    };
    const { container } = render(<BalanceCardV2 data={withDebt} />);
    expect(container.textContent).toContain('$70.00');
  });
});

describe('BalanceCardV2 — watched-address badge', () => {
  it('renders the badge when isSelfQuery is false + address is present', () => {
    const watched: BalanceCardV2Data = {
      ...baseData,
      isSelfQuery: false,
      address: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      suinsName: 'alex.sui',
    };
    const { container } = render(<BalanceCardV2 data={watched} />);
    expect(container.textContent).toContain('alex.sui');
  });

  it('does not render the badge for self queries (default)', () => {
    const { container } = render(<BalanceCardV2 data={baseData} />);
    // No suinsName + isSelfQuery undefined → no AddressBadge.
    expect(container.querySelector('span[title]')).toBeNull();
  });
});
