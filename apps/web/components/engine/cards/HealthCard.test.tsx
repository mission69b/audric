/**
 * SPEC 23B HealthSummary — HealthCard variant tests (2026-05-12).
 *
 * Covers:
 *   - default variant: HF hero + Gauge + 4-row detail + StatusBadge + title.
 *   - post-write variant: 3-col grid (HF · Supplied · Borrowed) with status
 *     pill in HF cell, no gauge, no Max Borrow / Liq. Threshold rows, no
 *     title bar, tighter padding.
 *   - status classification (healthy / warning / danger / critical) across
 *     the HF / borrowed thresholds.
 *   - HF formatting (∞ for zero-debt, dust handling, normal cases).
 *   - watched-address badge behavior (default only; intentionally dropped
 *     in post-write for consistency with BalanceCard W1).
 *
 * Convention: this codebase does NOT extend `@testing-library/jest-dom`.
 * Tests use raw DOM API (`textContent`, `querySelector`).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthCard, getHfStatus, formatHf } from './HealthCard';

const baseData = {
  healthFactor: 4.21,
  supplied: 16.91,
  borrowed: 8.46,
  maxBorrow: 12.34,
  liquidationThreshold: 0.85,
};

const zeroDebtData = {
  healthFactor: null,
  supplied: 16.91,
  borrowed: 0,
};

describe('HealthCard — default variant (standalone)', () => {
  it('renders the "Health Factor" title bar', () => {
    render(<HealthCard data={baseData} />);
    expect(document.body.textContent).toContain('Health Factor');
  });

  it('renders the HF hero number (large 2xl)', () => {
    const { container } = render(<HealthCard data={baseData} />);
    const heros = container.querySelectorAll('.text-2xl');
    expect(heros.length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('4.21');
  });

  it('renders the gauge (default variant only)', () => {
    const { container } = render(<HealthCard data={baseData} />);
    // Gauge thresholds emit "Liq." + "You: 4.21" labels; the gauge is the
    // only place those strings appear.
    expect(document.body.textContent).toContain('Liq.');
    expect(document.body.textContent).toContain('You:');
    void container;
  });

  it('renders all 4 detail rows (Supplied / Borrowed / Max Borrow / Liq. Threshold)', () => {
    render(<HealthCard data={baseData} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Supplied');
    expect(text).toContain('Borrowed');
    expect(text).toContain('Max Borrow');
    expect(text).toContain('Liq. Threshold');
    expect(text).toContain('$16.91');
    expect(text).toContain('$8.46');
    expect(text).toContain('$12.34');
    expect(text).toContain('0.85');
  });

  it('renders ∞ for zero-debt accounts (no liquidation possible)', () => {
    render(<HealthCard data={zeroDebtData} />);
    expect(document.body.textContent).toContain('∞');
  });

  it('renders the watched-address badge when isSelfQuery === false', () => {
    render(
      <HealthCard
        data={{
          ...baseData,
          isSelfQuery: false,
          address:
            '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          suinsName: 'alex.sui',
        }}
      />,
    );
    expect(document.body.textContent).toContain('alex.sui');
  });
});

describe('HealthCard — post-write variant', () => {
  it('omits the "Health Factor" title bar', () => {
    const { container } = render(
      <HealthCard data={baseData} variant="post-write" />,
    );
    expect(container.querySelector('.bg-surface-sunken')).toBeNull();
    expect(document.body.textContent).not.toContain('Health Factor');
  });

  it('omits the gauge (no "Liq." / "You:" gauge labels)', () => {
    render(<HealthCard data={baseData} variant="post-write" />);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Liq.');
    expect(text).not.toContain('You:');
  });

  it('omits the 2xl HF hero (gauge surface dropped)', () => {
    const { container } = render(
      <HealthCard data={baseData} variant="post-write" />,
    );
    expect(container.querySelector('.text-2xl')).toBeNull();
  });

  it('omits Max Borrow + Liq. Threshold rows', () => {
    render(<HealthCard data={baseData} variant="post-write" />);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Max Borrow');
    expect(text).not.toContain('Liq. Threshold');
  });

  it('renders the 3-col grid (HF · Supplied · Borrowed)', () => {
    const { container } = render(
      <HealthCard data={baseData} variant="post-write" />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('HF');
    expect(text).toContain('Supplied');
    expect(text).toContain('Borrowed');
    expect(text).toContain('4.21');
    expect(text).toContain('$16.91');
    expect(text).toContain('$8.46');
    // 3 grid cells total
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBe(3);
  });

  it('renders the status pill inside the HF cell (StatusBadge presence)', () => {
    const { container } = render(
      <HealthCard data={baseData} variant="post-write" />,
    );
    // StatusBadge renders a pill — it's the only element with role-like
    // status-pip styling. Less brittle: assert the status text appears
    // (StatusBadge renders e.g. "Healthy" / "Warning" / "Danger" / "Critical").
    void container;
    const text = document.body.textContent ?? '';
    // HF 4.21 with $8.46 debt = healthy (>= 2.0)
    expect(text.toLowerCase()).toContain('healthy');
  });

  it('uses tighter cell padding (px-2.5 py-1.5)', () => {
    const { container } = render(
      <HealthCard data={baseData} variant="post-write" />,
    );
    expect(container.querySelector('.px-2\\.5')).not.toBeNull();
    expect(container.querySelector('.py-1\\.5')).not.toBeNull();
  });

  it('uses smaller value typography (text-[13px], not text-[15px] or 2xl)', () => {
    const { container } = render(
      <HealthCard data={baseData} variant="post-write" />,
    );
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBe(3);
    valueCells.forEach((cell) => {
      expect(cell.className).toContain('text-[13px]');
    });
  });

  it('renders ∞ for zero-debt accounts in post-write too', () => {
    render(<HealthCard data={zeroDebtData} variant="post-write" />);
    expect(document.body.textContent).toContain('∞');
    expect(document.body.textContent).toContain('$0.00');
  });

  it('borrowed cell uses warning tone when debt > dust', () => {
    const { container } = render(
      <HealthCard data={baseData} variant="post-write" />,
    );
    // Find the cell whose text content is the borrowed dollar value.
    const valueCells = Array.from(
      container.querySelectorAll('.font-mono.font-medium'),
    );
    const borrowedCell = valueCells.find((c) =>
      c.textContent?.includes('$8.46'),
    );
    expect(borrowedCell).toBeDefined();
    expect(borrowedCell!.className).toContain('text-warning-solid');
  });

  it('borrowed cell uses neutral tone when debt is dust ($0)', () => {
    const { container } = render(
      <HealthCard data={zeroDebtData} variant="post-write" />,
    );
    const valueCells = Array.from(
      container.querySelectorAll('.font-mono.font-medium'),
    );
    const borrowedCell = valueCells.find((c) =>
      c.textContent?.includes('$0.00'),
    );
    expect(borrowedCell).toBeDefined();
    expect(borrowedCell!.className).not.toContain('text-warning-solid');
  });

  it('intentionally drops watched-address badge in post-write (mirrors BalanceCard W1)', () => {
    render(
      <HealthCard
        data={{
          ...baseData,
          isSelfQuery: false,
          address:
            '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          suinsName: 'alex.sui',
        }}
        variant="post-write"
      />,
    );
    expect(document.body.textContent).not.toContain('alex.sui');
  });
});

describe('getHfStatus — HF classification (pure)', () => {
  it('returns healthy for zero debt regardless of HF', () => {
    expect(getHfStatus(0, 0)).toBe('healthy');
    expect(getHfStatus(null, 0)).toBe('healthy');
    expect(getHfStatus(undefined, 0)).toBe('healthy');
    expect(getHfStatus(0.5, 0)).toBe('healthy'); // even nonsense HF
  });

  it('returns healthy for dust-only debt (< $0.01)', () => {
    expect(getHfStatus(0.5, 0.005)).toBe('healthy');
    expect(getHfStatus(null, 0.001)).toBe('healthy');
  });

  it('returns healthy for null/Infinity HF with real debt', () => {
    expect(getHfStatus(null, 100)).toBe('healthy');
    expect(getHfStatus(Infinity, 100)).toBe('healthy');
  });

  it('classifies HF correctly for real-debt accounts', () => {
    expect(getHfStatus(0.9, 100)).toBe('critical'); // < 1.2
    expect(getHfStatus(1.19, 100)).toBe('critical');
    expect(getHfStatus(1.2, 100)).toBe('danger'); // [1.2, 1.5)
    expect(getHfStatus(1.49, 100)).toBe('danger');
    expect(getHfStatus(1.5, 100)).toBe('warning'); // [1.5, 2.0)
    expect(getHfStatus(1.99, 100)).toBe('warning');
    expect(getHfStatus(2.0, 100)).toBe('healthy'); // >= 2.0
    expect(getHfStatus(4.21, 100)).toBe('healthy');
  });
});

describe('formatHf — HF display + gauge value (pure)', () => {
  it('returns ∞ + max gauge for zero-debt accounts', () => {
    expect(formatHf(null, 0)).toEqual({ display: '∞', gaugeValue: 5 });
    expect(formatHf(0, 0)).toEqual({ display: '∞', gaugeValue: 5 });
    expect(formatHf(undefined, 0)).toEqual({ display: '∞', gaugeValue: 5 });
  });

  it('returns ∞ + max gauge for non-finite HF (Infinity from engine)', () => {
    expect(formatHf(Infinity, 100)).toEqual({ display: '∞', gaugeValue: 5 });
    expect(formatHf(NaN, 100)).toEqual({ display: '∞', gaugeValue: 5 });
  });

  it('returns 2-decimal HF for normal cases', () => {
    expect(formatHf(4.21, 100)).toEqual({ display: '4.21', gaugeValue: 4.21 });
    expect(formatHf(1.5, 100)).toEqual({ display: '1.50', gaugeValue: 1.5 });
    expect(formatHf(0.95, 100)).toEqual({ display: '0.95', gaugeValue: 0.95 });
  });
});

void screen;
