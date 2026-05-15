/**
 * V1 SwapQuoteCard — minimal regression coverage added during the
 * Days 10-16 audit V1 follow-up (2026-05-16). The full rendering is
 * exercised by SwapQuoteCardV2.test.tsx; these tests lock in the
 * `priceImpactToPct` decimal-vs-raw heuristic that was missing pre-fix.
 *
 * Convention: raw DOM API only — `textContent`, `querySelector`.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SwapQuoteCard } from './SwapQuoteCard';

const baseData = {
  fromToken: 'SUI',
  toToken: 'USDC',
  fromAmount: 10,
  toAmount: 13.7,
  priceImpact: 0.0042, // ENGINE EMIT SHAPE: decimal (= 0.42%)
};

describe('SwapQuoteCard — priceImpact (engine decimal shape)', () => {
  it('renders engine decimal as percentage (0.0042 → 0.42%)', () => {
    const { container } = render(<SwapQuoteCard data={baseData} />);
    expect(container.textContent ?? '').toContain('0.42%');
    expect(container.querySelector('.text-error-solid')).toBeNull();
    expect(container.querySelector('.text-warning-solid')).toBeNull();
  });

  it('fires the warning colour tier for 1-3% impact (engine decimal)', () => {
    const { container } = render(
      <SwapQuoteCard data={{ ...baseData, priceImpact: 0.018 }} />, // 1.8%
    );
    expect(container.textContent ?? '').toContain('1.80%');
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('fires the error colour tier for >3% impact (engine decimal)', () => {
    const { container } = render(
      <SwapQuoteCard data={{ ...baseData, priceImpact: 0.052 }} />, // 5.2%
    );
    expect(container.textContent ?? '').toContain('5.20%');
    expect(container.querySelector('.text-error-solid')).not.toBeNull();
  });

  it('falls back to >=1 raw-percentage path (defensive)', () => {
    const { container } = render(
      <SwapQuoteCard data={{ ...baseData, priceImpact: 1.8 }} />,
    );
    expect(container.textContent ?? '').toContain('1.80%');
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('does not crash on a non-numeric priceImpact (defensive)', () => {
    const bad = { ...baseData, priceImpact: 'oops' as unknown as number };
    const { container } = render(<SwapQuoteCard data={bad} />);
    expect(container.textContent ?? '').toContain('0.00%');
  });

  it('clamps negative priceImpact to 0%', () => {
    const negative = { ...baseData, priceImpact: -0.001 };
    const { container } = render(<SwapQuoteCard data={negative} />);
    expect(container.textContent ?? '').toContain('0.00%');
  });
});
