/**
 * SPEC 37 v0.7a Phase 2 Day 14-15 — HealthCardV2 unit tests.
 *
 * Convention: raw DOM API only — `textContent`, `querySelector`.
 *
 * Coverage:
 *   - Header: "Health factor" title chrome
 *   - HFGauge hero: ∞ for no-debt, numeric for debt, color tiers
 *   - Collateral / Debt 2-col grid: USD values + warning color when debt > 0
 *   - Borrowing capacity remaining row: shown when maxBorrow > 0,
 *     hidden otherwise; computed as max(0, maxBorrow - borrowed)
 *   - Liquidation threshold row: hidden when 1.0 (default) or absent;
 *     shown when explicitly different from 1.0
 *   - Watched-address badge
 *   - ∞ semantics: borrowed ≤ DEBT_DUST_USD passes Infinity to HFGauge,
 *     null/undefined healthFactor too, non-finite healthFactor too
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HealthCardV2, type HealthCardV2Data } from './HealthCardV2';

const baseData: HealthCardV2Data = {
  healthFactor: 2.10,
  supplied: 100,
  borrowed: 30,
  liquidationThreshold: 1.0,
};

describe('HealthCardV2 — header', () => {
  it('renders the "Health factor" title chrome', () => {
    const { container } = render(<HealthCardV2 data={baseData} />);
    expect(container.textContent).toContain('Health factor');
  });
});

describe('HealthCardV2 — HFGauge hero', () => {
  it('renders the HF value through the gauge label', () => {
    const { container } = render(<HealthCardV2 data={baseData} />);
    expect(container.textContent).toContain('2.10');
  });

  it('renders ∞ when borrowed is below the dust threshold', () => {
    const noDebt: HealthCardV2Data = {
      ...baseData,
      borrowed: 0,
      healthFactor: 99,
    };
    const { container } = render(<HealthCardV2 data={noDebt} />);
    expect(container.textContent).toContain('∞');
  });

  it('renders ∞ when healthFactor is null even with debt present', () => {
    const nullHF: HealthCardV2Data = {
      ...baseData,
      healthFactor: null,
      borrowed: 50,
    };
    const { container } = render(<HealthCardV2 data={nullHF} />);
    expect(container.textContent).toContain('∞');
  });

  it('renders ∞ when healthFactor is non-finite (e.g. Infinity)', () => {
    const infHF: HealthCardV2Data = {
      ...baseData,
      healthFactor: Number.POSITIVE_INFINITY,
      borrowed: 50,
    };
    const { container } = render(<HealthCardV2 data={infHF} />);
    expect(container.textContent).toContain('∞');
  });
});

describe('HealthCardV2 — collateral / debt 2-col', () => {
  it('renders Collateral and Debt labels with USD values', () => {
    const { container } = render(<HealthCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Collateral');
    expect(text).toContain('$100.00');
    expect(text).toContain('Debt');
    expect(text).toContain('$30.00');
  });

  it('renders Debt in warning color when borrowed > dust', () => {
    const { container } = render(<HealthCardV2 data={baseData} />);
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('renders Debt in primary color when borrowed is dust-only', () => {
    const noDebt: HealthCardV2Data = { ...baseData, borrowed: 0 };
    const { container } = render(<HealthCardV2 data={noDebt} />);
    // No warning span anywhere in the card when debt is 0.
    expect(container.querySelector('.text-warning-solid')).toBeNull();
  });
});

describe('HealthCardV2 — borrowing capacity', () => {
  it('renders the row when maxBorrow > borrowed', () => {
    const withMax: HealthCardV2Data = {
      ...baseData,
      maxBorrow: 80,
    };
    const { container } = render(<HealthCardV2 data={withMax} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Borrowing capacity remaining');
    // 80 - 30 = 50
    expect(text).toContain('$50.00');
  });

  it('hides the row when maxBorrow is absent', () => {
    const { container } = render(<HealthCardV2 data={baseData} />);
    expect(container.textContent ?? '').not.toContain('Borrowing capacity');
  });

  it('hides the row when maxBorrow is zero', () => {
    const noMax: HealthCardV2Data = { ...baseData, maxBorrow: 0 };
    const { container } = render(<HealthCardV2 data={noMax} />);
    expect(container.textContent ?? '').not.toContain('Borrowing capacity');
  });

  it('clamps remaining capacity to 0 when borrowed exceeds maxBorrow', () => {
    // Edge case: stale snapshot or interest-accrual blip can push borrowed
    // past maxBorrow briefly. The row should NOT show a negative number.
    const overdrawn: HealthCardV2Data = {
      ...baseData,
      borrowed: 100,
      maxBorrow: 80,
    };
    const { container } = render(<HealthCardV2 data={overdrawn} />);
    // When borrowed > maxBorrow, the row hides entirely (the
    // hasBorrowingCapacity guard catches it). Verify hidden.
    expect(container.textContent ?? '').not.toContain('Borrowing capacity');
  });
});

describe('HealthCardV2 — liquidation threshold row', () => {
  it('hides the row when liquidationThreshold is 1.0 (default)', () => {
    const { container } = render(<HealthCardV2 data={baseData} />);
    expect(container.textContent ?? '').not.toContain('Liquidation threshold');
  });

  it('hides the row when liquidationThreshold is absent', () => {
    const noLiq: HealthCardV2Data = { ...baseData };
    delete noLiq.liquidationThreshold;
    const { container } = render(<HealthCardV2 data={noLiq} />);
    expect(container.textContent ?? '').not.toContain('Liquidation threshold');
  });

  it('renders the row when liquidationThreshold differs from 1.0', () => {
    const customLiq: HealthCardV2Data = {
      ...baseData,
      liquidationThreshold: 0.85,
    };
    const { container } = render(<HealthCardV2 data={customLiq} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Liquidation threshold');
    expect(text).toContain('0.85');
  });

  // [Days 10-16 audit fix / 2026-05-16] Engine emits `liquidationThreshold:
  // 0` from its positionFetcher path (audric production today, see
  // `health.ts:122-123`) as a sentinel for "unknown" — NOT as a real
  // threshold. Pre-fix V2 rendered both a confusing "Liquidation threshold ·
  // 0.00" row AND drew the gauge marker at HF=0. Both bugs are now hidden.
  it('hides the row when liquidationThreshold is 0 (engine "unknown" sentinel)', () => {
    const sentinelLiq: HealthCardV2Data = {
      ...baseData,
      liquidationThreshold: 0,
    };
    const { container } = render(<HealthCardV2 data={sentinelLiq} />);
    expect(container.textContent ?? '').not.toContain('Liquidation threshold');
    // Sanity: the rest of the card still renders
    expect(container.textContent ?? '').toContain('Health factor');
    expect(container.textContent ?? '').toContain('Collateral');
  });

  it('hides the row when liquidationThreshold is negative (defensive)', () => {
    const negativeLiq: HealthCardV2Data = {
      ...baseData,
      liquidationThreshold: -0.5,
    };
    const { container } = render(<HealthCardV2 data={negativeLiq} />);
    expect(container.textContent ?? '').not.toContain('Liquidation threshold');
  });
});

describe('HealthCardV2 — watched-address badge', () => {
  it('renders the badge when isSelfQuery=false + address present', () => {
    const watched: HealthCardV2Data = {
      ...baseData,
      isSelfQuery: false,
      address: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      suinsName: 'alex.sui',
    };
    const { container } = render(<HealthCardV2 data={watched} />);
    expect(container.textContent ?? '').toContain('alex.sui');
  });

  it('does not render the badge for self queries', () => {
    const { container } = render(<HealthCardV2 data={baseData} />);
    // No suinsName + isSelfQuery undefined → no AddressBadge.
    expect(container.querySelector('span[title]')).toBeNull();
  });
});
