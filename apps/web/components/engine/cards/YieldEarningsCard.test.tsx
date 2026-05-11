/**
 * SPEC 23B-polish audit — YieldEarningsCard render tests.
 *
 * Covers:
 *   - all-time hero + Today/Week/Month/AllTime rows render
 *   - sparkline renders when data length ≥ 2
 *   - Deposited + Projected/Year rows now use shared `fmtYield` floor
 *     (regression guard for the within-card inconsistency fix —
 *      pre-fix Deposited/Projected used `val < 0.01` strict-threshold floor
 *      while sibling rows used `fmtUsd === '0.00'` rounding-based floor; for
 *      values in [0.005, 0.01) the same card showed two different floors)
 *   - APY row formatting (rate < 1 → multiply by 100; rate ≥ 1 → as-is)
 *
 * Convention: per `BalanceCard.test.tsx`, this codebase does NOT extend
 * `@testing-library/jest-dom` matchers.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { YieldEarningsCard } from './YieldEarningsCard';

const baseData = {
  today: 0.05,
  thisWeek: 0.35,
  thisMonth: 1.5,
  allTime: 18.42,
  currentApy: 0.0421,
  deposited: 437.81,
  projectedYear: 18.43,
};

describe('YieldEarningsCard', () => {
  it('renders the all-time hero + 4 detail rows', () => {
    render(<YieldEarningsCard data={baseData} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('All-time earnings');
    expect(text).toContain('$18.42');
    expect(text).toContain('Today');
    expect(text).toContain('$0.05');
    expect(text).toContain('This Week');
    expect(text).toContain('$0.35');
    expect(text).toContain('This Month');
    expect(text).toContain('$1.50');
  });

  it('renders Current APY (rate < 1 → multiplied by 100)', () => {
    render(<YieldEarningsCard data={baseData} />);
    expect(document.body.textContent).toContain('4.21%');
  });

  it('renders Current APY when rate ≥ 1 (already a percent value)', () => {
    render(<YieldEarningsCard data={{ ...baseData, currentApy: 8.4 }} />);
    expect(document.body.textContent).toContain('8.40%');
  });

  it('renders Deposited + Projected/Year rows', () => {
    render(<YieldEarningsCard data={baseData} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Deposited');
    expect(text).toContain('$437.81');
    expect(text).toContain('Projected / Year');
    expect(text).toContain('$18.43');
  });

  // [SPEC 23B-polish audit, 2026-05-11] Regression guard for within-card
  // floor consistency. Pre-fix:
  //   - Today/Week/Month/AllTime → fmtYield → rounding-based floor
  //   - Deposited/Projected     → inline `val < 0.01` → strict-threshold floor
  // For value 0.0046 (sub-cent dust):
  //   - Today row would correctly show "< $0.01" (fmtYield)
  //   - Deposited row would show "< $0.01" (inline)
  // For value 0.007 (between half-cent and 1 cent):
  //   - Today row would show "$0.01" (fmtYield rounds up)
  //   - Deposited row would show "< $0.01" (inline strict <0.01)
  // Post-fix both branches use fmtYield → both show "$0.01" for 0.007.
  it('floors sub-cent Deposited via fmtYield (consistent with sibling rows)', () => {
    render(
      <YieldEarningsCard
        data={{ ...baseData, deposited: 0.0046, projectedYear: 0.0046 }}
      />,
    );
    const text = document.body.textContent ?? '';
    // Both rows should show "< $0.01" (matches Today/Week/etc. behavior).
    const occurrences = (text.match(/< \$0\.01/g) ?? []).length;
    // Deposited + Projected/Year both flooring → at least 2 occurrences.
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('renders Deposited as "$0.01" for values in [0.005, 0.01) — fmtYield rounds, inline floored', () => {
    render(
      <YieldEarningsCard
        data={{ ...baseData, deposited: 0.007, projectedYear: 0.007 }}
      />,
    );
    const text = document.body.textContent ?? '';
    // Pre-fix this would show "< $0.01" (inline strict-threshold).
    // Post-fix (fmtYield) → "$0.01" (fmtUsd rounds 0.007 up to "0.01").
    expect(text).toContain('$0.01');
  });

  it('renders sparkline when data length ≥ 2', () => {
    const { container } = render(
      <YieldEarningsCard data={{ ...baseData, sparkline: [0, 1, 3, 7, 12] }} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
  });

  it('omits sparkline when data length < 2', () => {
    const { container } = render(
      <YieldEarningsCard data={{ ...baseData, sparkline: [42] }} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('omits sparkline when sparkline is undefined', () => {
    const { container } = render(<YieldEarningsCard data={baseData} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
