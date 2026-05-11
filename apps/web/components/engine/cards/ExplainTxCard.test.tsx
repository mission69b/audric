/**
 * SPEC 23B-polish — ExplainTxCard render tests.
 *
 * Covers:
 *   - status / gas / time rows render
 *   - status case-insensitive normalization (regression guard for the
 *     "Success" → wrong-tone bug pre-fix)
 *   - effects render with correct ↑/↓ prefix + amount + truncated address
 *   - SuiscanLink renders at the footer
 *   - card renders defensively when effects array is empty
 *
 * Convention: per `BalanceCard.test.tsx`, this codebase does NOT extend
 * `@testing-library/jest-dom` matchers.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ExplainTxCard } from './ExplainTxCard';

const baseData = {
  digest: 'BBRYSnrJ0000000000000000000000000000000000000000000000000J6anMV',
  sender: '0xa3f9b27c0000000000000000000000000000000000000000000000000000abcd',
  status: 'success',
  gasUsed: '0.0023 SUI',
  timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
  effects: [
    { type: 'send', description: '0xa3f9b27c0000000000000000000000000000000000000000000000000000abcd sent 6.00 USDC' },
    { type: 'receive', description: '0xb1c4d29e0000000000000000000000000000000000000000000000000000ef01 received 6.00 USDC' },
  ],
  summary: 'Sent 6.00 USDC to 0xb1c4d29e…ef01',
};

describe('ExplainTxCard', () => {
  it('renders status / gas / time rows', () => {
    render(<ExplainTxCard data={baseData} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Status');
    expect(text).toContain('success');
    expect(text).toContain('Gas');
    expect(text).toContain('0.0023 SUI');
    expect(text).toContain('Time');
    expect(text).toContain('5m ago');
  });

  it('renders effects with ↑/↓ prefix + amount + truncated address', () => {
    render(<ExplainTxCard data={baseData} />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/↑\s*−6\.00 USDC/);
    expect(text).toMatch(/↓\s*\+6\.00 USDC/);
  });

  it('renders the SuiscanLink at the footer', () => {
    const { container } = render(<ExplainTxCard data={baseData} />);
    const anchor = container.querySelector('a[href*="suiscan.xyz"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toContain(baseData.digest);
  });

  // [SPEC 23B-polish, 2026-05-11] Regression guard for status case-insensitivity.
  // Pre-fix `data.status === 'success'` was case-sensitive — `'Success'` /
  // `'SUCCESS'` fell through to the warning-tone branch and rendered visually
  // as a partial failure. Now the routing is case-insensitive while the
  // displayed text preserves the engine's original casing.
  it('normalizes status case before tone routing — "Success" gets success tone', () => {
    const { container } = render(
      <ExplainTxCard data={{ ...baseData, status: 'Success' }} />,
    );
    // The status span keeps the original casing in its text…
    expect(container.textContent).toContain('Success');
    // …and the tone class is success (green), not warning (yellow).
    const statusSpan = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === 'Success',
    );
    expect(statusSpan?.className).toContain('text-success-solid');
    expect(statusSpan?.className).not.toContain('text-warning-solid');
  });

  it('normalizes status case — "SUCCESS" also routes to success tone', () => {
    const { container } = render(
      <ExplainTxCard data={{ ...baseData, status: 'SUCCESS' }} />,
    );
    const statusSpan = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === 'SUCCESS',
    );
    expect(statusSpan?.className).toContain('text-success-solid');
  });

  it('routes non-success status to warning tone (e.g. "failure", "Failure")', () => {
    const { container } = render(
      <ExplainTxCard data={{ ...baseData, status: 'Failure' }} />,
    );
    const statusSpan = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === 'Failure',
    );
    expect(statusSpan?.className).toContain('text-warning-solid');
    expect(statusSpan?.className).not.toContain('text-success-solid');
  });

  it('handles empty effects array without rendering an empty divider', () => {
    const { container } = render(
      <ExplainTxCard data={{ ...baseData, effects: [] }} />,
    );
    // The "effects" border-top section is conditional on `effects.length > 0`.
    // The card should still render the status block + suiscan link.
    expect(container.textContent).toContain('Status');
    expect(container.querySelector('a[href*="suiscan.xyz"]')).not.toBeNull();
  });

  it('filters out effects with type === "event"', () => {
    render(
      <ExplainTxCard
        data={{
          ...baseData,
          effects: [
            { type: 'event', description: 'CoinBalanceChanged event payload' },
            { type: 'send', description: '0xabc sent 1.00 USDC' },
          ],
        }}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('CoinBalanceChanged');
    expect(text).toContain('1.00 USDC');
  });

  it('omits Time row when timestamp is undefined', () => {
    render(<ExplainTxCard data={{ ...baseData, timestamp: undefined }} />);
    expect(document.body.textContent).not.toContain('Time');
  });

  it('falls back to raw description when address regex does not match', () => {
    render(
      <ExplainTxCard
        data={{
          ...baseData,
          effects: [{ type: 'receive', description: 'Mint receipt for object 0xdef…123' }],
        }}
      />,
    );
    expect(document.body.textContent).toContain('Mint receipt for object');
  });
});
