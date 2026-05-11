/**
 * SPEC 23B-polish — RatesCard render tests.
 *
 * Covers:
 *   - asset / supply / borrow column headers render
 *   - rows sort by saveApy descending
 *   - APY values render as % with 2 decimals
 *   - empty data renders nothing (returns null)
 *   - rows with non-numeric saveApy are filtered out defensively
 *
 * Convention: per `BalanceCard.test.tsx`, raw DOM API only.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RatesCard } from './RatesCard';

describe('RatesCard', () => {
  it('renders Asset / Supply / Borrow column headers', () => {
    render(
      <RatesCard
        data={{
          USDC: { saveApy: 0.0421, borrowApy: 0.0612 },
          USDsui: { saveApy: 0.0884, borrowApy: 0.0934 },
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('Asset');
    expect(text).toContain('Supply');
    expect(text).toContain('Borrow');
  });

  it('renders rows for each asset with formatted percentages', () => {
    render(
      <RatesCard
        data={{
          USDC: { saveApy: 0.0421, borrowApy: 0.0612 },
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).toContain('4.21%');
    expect(text).toContain('6.12%');
  });

  it('sorts rows by saveApy descending', () => {
    const { container } = render(
      <RatesCard
        data={{
          USDC: { saveApy: 0.0421, borrowApy: 0.0612 },
          USDsui: { saveApy: 0.0884, borrowApy: 0.0934 },
          NAVX: { saveApy: 0.012, borrowApy: 0.04 },
        }}
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('USDsui'); // highest APY first
    expect(rows[1].textContent).toContain('USDC');
    expect(rows[2].textContent).toContain('NAVX'); // lowest last
  });

  it('returns null when data is empty', () => {
    const { container } = render(<RatesCard data={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('filters out rows where saveApy is not a number', () => {
    render(
      <RatesCard
        data={{
          USDC: { saveApy: 0.0421, borrowApy: 0.0612 },
          // @ts-expect-error intentional bad data
          BROKEN: { saveApy: 'not-a-number', borrowApy: 0.05 },
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).not.toContain('BROKEN');
  });

  it('renders the "Lending Rates" title bar', () => {
    render(
      <RatesCard data={{ USDC: { saveApy: 0.0421, borrowApy: 0.0612 } }} />,
    );
    expect(document.body.textContent).toContain('Lending Rates');
  });
});
