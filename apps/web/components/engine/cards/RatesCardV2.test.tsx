/**
 * SPEC 37 v0.7a Phase 2 Day 23 — RatesCardV2 unit tests.
 *
 * Convention: raw DOM API only — `textContent`, `querySelector`, `querySelectorAll`.
 *
 * Coverage:
 *   - Header: "Lending rates" + Supply / Borrow column labels
 *   - Per-asset row: APYBlocks for both supply + borrow
 *   - Sorting: rows ordered by saveApy descending (matches v1)
 *   - Empty data: returns null
 *   - APY conversion: raw percentage (4.62) → bps (462) → "4.62%" rendered
 *   - Multiple assets: USDC, USDsui, SUI all render in correct order
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RatesCardV2 } from './RatesCardV2';

describe('RatesCardV2 — header', () => {
  it('renders "Lending rates" title + Supply / Borrow column labels', () => {
    // Engine emit shape: decimal (0.0462 = 4.62%) per
    // packages/engine/src/navi/transforms.ts.
    const { container } = render(
      <RatesCardV2 data={{ USDC: { saveApy: 0.0462, borrowApy: 0.052 } }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Lending rates');
    expect(text).toContain('Supply');
    expect(text).toContain('Borrow');
  });
});

describe('RatesCardV2 — per-asset rows', () => {
  it('renders APYBlock with supply rate for USDC (engine decimal emit)', () => {
    // Realistic engine shape: saveApy is a decimal.
    const { container } = render(
      <RatesCardV2 data={{ USDC: { saveApy: 0.0462, borrowApy: 0.052 } }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).toContain('4.62%');
    expect(text).toContain('5.20%');
  });

  it('handles a raw-percentage upstream (defensive heuristic)', () => {
    // If an upstream surface ever passes raw percentages instead of decimals,
    // the < 1 ? decimal : raw heuristic should still display the correct number.
    const { container } = render(
      <RatesCardV2 data={{ USDC: { saveApy: 7.5, borrowApy: 9.25 } }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('7.50%');
    expect(text).toContain('9.25%');
  });

  it('renders correctly across the realistic decimal range (0.001–0.25)', () => {
    const { container } = render(
      <RatesCardV2
        data={{
          A: { saveApy: 0.001, borrowApy: 0.005 }, // 0.10% / 0.50%
          B: { saveApy: 0.082, borrowApy: 0.142 }, // 8.20% / 14.20%
          C: { saveApy: 0.25, borrowApy: 0.32 }, // 25.00% / 32.00%
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('0.10%');
    expect(text).toContain('0.50%');
    expect(text).toContain('8.20%');
    expect(text).toContain('14.20%');
    expect(text).toContain('25.00%');
    expect(text).toContain('32.00%');
  });

  it('renders multiple assets in order (sorted by saveApy desc)', () => {
    // Use non-overlapping symbols so substring-search reliably anchors the row.
    // Pre-fix this test used USDC/USDsui/SUI — but `text.indexOf('SUI')` finds
    // the "SUI" substring INSIDE "USDsui" first (offset +3 from the USDsui row),
    // making the sort assertion trivially true regardless of actual order.
    const { container } = render(
      <RatesCardV2
        data={{
          USDC: { saveApy: 0.0462, borrowApy: 0.052 },
          USDT: { saveApy: 0.061, borrowApy: 0.07 },
          ETH: { saveApy: 0.032, borrowApy: 0.048 },
        }}
      />,
    );
    const text = container.textContent ?? '';
    const idxUsdt = text.indexOf('USDT');
    const idxUsdc = text.indexOf('USDC');
    const idxEth = text.indexOf('ETH');
    expect(idxUsdt).toBeGreaterThan(-1);
    expect(idxUsdc).toBeGreaterThan(-1);
    expect(idxEth).toBeGreaterThan(-1);
    // USDT (6.1%) > USDC (4.62%) > ETH (3.2%)
    expect(idxUsdt).toBeLessThan(idxUsdc);
    expect(idxUsdc).toBeLessThan(idxEth);
  });

  it('filters out rows without numeric saveApy', () => {
    const { container } = render(
      <RatesCardV2
        data={{
          USDC: { saveApy: 0.0462, borrowApy: 0.052 },
          // @ts-expect-error — testing defensive filter
          BROKEN: { saveApy: 'not-a-number', borrowApy: 0.05 },
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).not.toContain('BROKEN');
  });
});

describe('RatesCardV2 — empty state', () => {
  it('returns null when data is empty', () => {
    const { container } = render(<RatesCardV2 data={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when no entries have saveApy', () => {
    const { container } = render(
      <RatesCardV2
        data={{
          // @ts-expect-error — testing defensive filter
          BROKEN: { saveApy: undefined, borrowApy: 5.0 },
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('RatesCardV2 — defensive APY handling', () => {
  it('clamps negative borrow rate to 0% (no crash)', () => {
    const { container } = render(
      <RatesCardV2 data={{ USDC: { saveApy: 0.0462, borrowApy: -1 } }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('4.62%');
    expect(text).toContain('0.00%');
  });
});
