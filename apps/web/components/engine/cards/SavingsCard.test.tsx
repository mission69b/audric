/**
 * SPEC 23B-polish — SavingsCard render tests.
 *
 * Covers:
 *   - supplies + borrows tables render with USD + APY columns
 *   - blended APY + daily earning footer renders when `earnings` present
 *   - sub-cent daily earning floors to "< $0.01" via shared `fmtYield`
 *     (regression guard for the "$0.0000/day" bug pre-fix)
 *   - watched-address badge renders when `isSelfQuery === false`
 *   - card renders nothing when no positions + no earnings
 *
 * Convention: per `BalanceCard.test.tsx`, this codebase does NOT extend
 * `@testing-library/jest-dom` matchers. Tests use raw `document.body.textContent`.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SavingsCard } from './SavingsCard';

const baseSupplies = [
  { symbol: 'USDsui', amount: 16.8964, valueUsd: 16.89, apy: 0.0894, type: 'supply' as const },
  { symbol: 'USDC', amount: 3.8971, valueUsd: 3.9, apy: 0.0484, type: 'supply' as const },
];

describe('SavingsCard', () => {
  it('renders supply positions table with USD + APY', () => {
    render(<SavingsCard data={{ positions: baseSupplies }} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('USDsui');
    expect(text).toContain('USDC');
    expect(text).toContain('$16.89');
    expect(text).toContain('$3.90');
    expect(text).toContain('8.94%');
    expect(text).toContain('4.84%');
  });

  it('renders borrow positions when present', () => {
    render(
      <SavingsCard
        data={{
          positions: [
            ...baseSupplies,
            { symbol: 'SUI', amount: 5.0, valueUsd: 6.5, apy: 0.062, type: 'borrow' as const },
          ],
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('Borrow');
    expect(text).toContain('$6.50');
    expect(text).toContain('6.20%');
  });

  it('renders earnings footer with blended APY + daily', () => {
    render(
      <SavingsCard
        data={{
          positions: baseSupplies,
          // 0.05/day is above the sub-cent floor → renders as "$0.05"
          earnings: { currentApy: 0.0803, dailyEarning: 0.05, supplied: 20.79 },
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('Blended APY');
    expect(text).toContain('8.03%');
    expect(text).toContain('Daily');
    expect(text).toContain('$0.05');
  });

  // [SPEC 23B-polish, 2026-05-11] Regression guard for sub-cent floor.
  // Pre-fix this rendered "$0.0000" via the inline toFixed(4) call. Now
  // it must drop to "< $0.01" so the user reads "earning, but tiny" not
  // "no earnings".
  it('floors sub-cent daily earnings to "< $0.01"', () => {
    render(
      <SavingsCard
        data={{
          positions: baseSupplies,
          // 0.0000412 → fmtUsd → "0.00" → fmtYield triggers floor.
          earnings: { currentApy: 0.0884, dailyEarning: 0.0000412, supplied: 0.5 },
        }}
      />,
    );
    expect(document.body.textContent).toContain('< $0.01');
    expect(document.body.textContent).not.toContain('$0.0000');
  });

  it('returns null when no positions + no earnings', () => {
    const { container } = render(<SavingsCard data={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders watched-address badge when isSelfQuery === false', () => {
    render(
      <SavingsCard
        data={{
          positions: baseSupplies,
          isSelfQuery: false,
          address: '0xa3f9b27c0000000000000000000000000000000000000000000000000000abcd',
          suinsName: 'alex.sui',
        }}
      />,
    );
    expect(document.body.textContent).toContain('alex.sui');
  });

  it('does not render watched-address badge when isSelfQuery is undefined (own wallet)', () => {
    render(<SavingsCard data={{ positions: baseSupplies }} />);
    // no badge → no truncated 0x… in the output
    expect(document.body.textContent).not.toMatch(/0x[a-f0-9]{4}…[a-f0-9]{4}/i);
  });

  it('filters out supply positions with valueUsd < $0.01 (dust)', () => {
    render(
      <SavingsCard
        data={{
          positions: [
            ...baseSupplies,
            { symbol: 'DUST', amount: 0.0001, valueUsd: 0.005, apy: 0.05, type: 'supply' as const },
          ],
        }}
      />,
    );
    expect(document.body.textContent).not.toContain('DUST');
  });
});
