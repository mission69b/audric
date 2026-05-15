/**
 * Day 9 (b) — APYBlock unit tests.
 *
 * 3 stories from TOOL_UX_DESIGN_v07a.md Day 9 (b) spec:
 *   - stable (no trend chip)
 *   - with-trend-up (7d_up → green ↑)
 *   - with-trend-down (7d_down → red ↓)
 *
 * Plus the bps formatter edge cases: 0 bps, sub-1bps, NaN.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { APYBlock } from './APYBlock';

describe('APYBlock — stable (no trend)', () => {
  it('renders asset · APY · "APY" suffix', () => {
    const { container } = render(<APYBlock asset="USDC" apyBps={462} />);
    const text = container.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).toContain('4.62%');
    expect(text).toContain('APY');
  });

  it('does not render the trend chip when trend is omitted', () => {
    const { container } = render(<APYBlock asset="USDC" apyBps={462} />);
    expect(container.textContent ?? '').not.toContain('7d');
  });
});

describe('APYBlock — with-trend-up', () => {
  it('renders ↑ 7d chip with success color', () => {
    const { container } = render(
      <APYBlock asset="USDsui" apyBps={520} trend="7d_up" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('5.20%');
    expect(text).toContain('↑ 7d');
    expect(container.querySelector('.text-success-solid')).not.toBeNull();
  });
});

describe('APYBlock — with-trend-down', () => {
  it('renders ↓ 7d chip with error color', () => {
    const { container } = render(
      <APYBlock asset="USDC" apyBps={380} trend="7d_down" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('3.80%');
    expect(text).toContain('↓ 7d');
    expect(container.querySelector('.text-error-solid')).not.toBeNull();
  });
});

describe('APYBlock — flat trend', () => {
  it('renders · flat chip with muted color', () => {
    const { container } = render(
      <APYBlock asset="USDC" apyBps={462} trend="flat" />,
    );
    expect(container.textContent ?? '').toContain('· flat');
  });
});

describe('APYBlock — bps formatting edge cases', () => {
  it('renders 0.00% for 0 bps', () => {
    const { container } = render(<APYBlock asset="USDC" apyBps={0} />);
    expect(container.textContent ?? '').toContain('0.00%');
  });

  it('renders 0.01% for 1 bps', () => {
    const { container } = render(<APYBlock asset="USDC" apyBps={1} />);
    expect(container.textContent ?? '').toContain('0.01%');
  });

  it('renders em-dash for negative bps (defensive)', () => {
    const { container } = render(<APYBlock asset="USDC" apyBps={-50} />);
    expect(container.textContent ?? '').toContain('—');
  });

  it('renders em-dash for NaN bps (defensive)', () => {
    const { container } = render(<APYBlock asset="USDC" apyBps={Number.NaN} />);
    expect(container.textContent ?? '').toContain('—');
  });
});
