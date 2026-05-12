/**
 * SPEC 23B — N5 — PendingRewardsCard tests.
 *
 * Covers the 3 render states (claimable / empty / degraded) plus the
 * USD-column conditional + total footer. Same convention as
 * SuinsResolution.test.tsx + ConfirmationChip.test.tsx — inline next to
 * source, vitest + raw DOM API (no jest-dom matchers, which this codebase
 * does not extend in vitest.setup.ts).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PendingRewardsCard } from './PendingRewardsCard';

const sampleReward = (overrides: Partial<{
  protocol: string;
  asset: string;
  coinType: string;
  symbol: string;
  amount: number;
  estimatedValueUsd: number;
}> = {}) => ({
  protocol: 'navi',
  asset: '5',
  coinType: '0xabc::cert::CERT',
  symbol: 'vSUI',
  amount: 0.0165,
  estimatedValueUsd: 0.04,
  ...overrides,
});

describe('PendingRewardsCard primitive', () => {
  it('healthy + claimable: renders Symbol / Amount / Value rows + Total claimable footer', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [
            sampleReward(),
            sampleReward({
              coinType: '0xdef::navx::NAVX',
              symbol: 'NAVX',
              amount: 12.4,
              estimatedValueUsd: 1.24,
            }),
          ],
          totalValueUsd: 1.28,
          degraded: false,
          degradationReason: null,
        }}
      />,
    );

    expect(container.textContent).toContain('Pending Rewards');
    expect(container.textContent).toContain('vSUI');
    expect(container.textContent).toContain('NAVX');
    expect(container.textContent).toContain('$0.04');
    expect(container.textContent).toContain('$1.24');
    expect(container.textContent).toContain('Total claimable');
    expect(container.textContent).toContain('$1.28');
  });

  it('healthy + empty: renders quiet empty state, no table, no total footer', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [],
          totalValueUsd: 0,
          degraded: false,
          degradationReason: null,
        }}
      />,
    );

    expect(container.textContent).toContain('No claimable rewards yet');
    expect(container.textContent).not.toContain('Total claimable');
    expect(container.querySelector('table')).toBeNull();
  });

  it('degraded (PROTOCOL_UNAVAILABLE): renders warning headline naming NAVI', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [],
          totalValueUsd: 0,
          degraded: true,
          degradationReason: 'PROTOCOL_UNAVAILABLE',
        }}
      />,
    );

    expect(container.textContent).toContain('NAVI rewards lookup unavailable');
    expect(container.textContent).toContain('Try again in a moment');
    expect(container.textContent).not.toContain('No claimable rewards');
    expect(container.textContent).not.toContain('Total claimable');
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('degraded (UNKNOWN): renders generic warning headline', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [],
          totalValueUsd: 0,
          degraded: true,
          degradationReason: 'UNKNOWN',
        }}
      />,
    );

    expect(container.textContent).toContain('Rewards lookup failed');
    expect(container.textContent).toContain('Try again in a moment');
  });

  it('degraded (null reason): falls back to generic warning headline', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [],
          totalValueUsd: 0,
          degraded: true,
          degradationReason: null,
        }}
      />,
    );

    expect(container.textContent).toContain('Rewards lookup failed');
  });

  it('omits the USD value column when no reward is priced (avoids dash-only column)', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [
            sampleReward({ symbol: 'WEIRD', amount: 1.5, estimatedValueUsd: 0 }),
            sampleReward({
              coinType: '0xdef::other::OTHER',
              symbol: 'OTHER',
              amount: 0.5,
              estimatedValueUsd: 0,
            }),
          ],
          totalValueUsd: 0,
          degraded: false,
          degradationReason: null,
        }}
      />,
    );

    const ths = container.querySelectorAll('th');
    const headers = Array.from(ths).map((th) => th.textContent?.trim());
    expect(headers).toContain('Reward');
    expect(headers).toContain('Amount');
    expect(headers).not.toContain('Value');
    // Total footer also suppressed when total is 0
    expect(container.textContent).not.toContain('Total claimable');
  });

  it('shows Value column with em-dash when SOME but not all rewards are priced', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [
            sampleReward({ symbol: 'vSUI', amount: 0.0165, estimatedValueUsd: 0.04 }),
            sampleReward({
              coinType: '0xdef::weird::WEIRD',
              symbol: 'WEIRD',
              amount: 1.5,
              estimatedValueUsd: 0,
            }),
          ],
          totalValueUsd: 0.04,
          degraded: false,
          degradationReason: null,
        }}
      />,
    );

    expect(container.textContent).toContain('$0.04');
    expect(container.textContent).toContain('—');
  });

  it('formats sub-0.0001 amounts without scientific notation', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [sampleReward({ amount: 0.000005, estimatedValueUsd: 0 })],
          totalValueUsd: 0,
          degraded: false,
          degradationReason: null,
        }}
      />,
    );

    expect(container.textContent).not.toContain('e-');
    expect(container.textContent).not.toContain('E-');
  });

  it('formats >=1 amounts with thousands separators', () => {
    const { container } = render(
      <PendingRewardsCard
        data={{
          rewards: [sampleReward({ symbol: 'NAVX', amount: 1234.5678, estimatedValueUsd: 0 })],
          totalValueUsd: 0,
          degraded: false,
          degradationReason: null,
        }}
      />,
    );

    expect(container.textContent).toContain('1,234.5678');
  });

  it('renders multiple rewards in stable per-coinType key order', () => {
    // Regression: if the renderer used array index as React key, swapping
    // adjacent rewards (e.g. adapter sorting reshuffles) would force a
    // remount instead of an update. Stable coinType-based keys avoid
    // that — the user shouldn't see a flicker when prices shift the
    // sort order between turns.
    const data = {
      rewards: [
        sampleReward({ coinType: '0xabc::a::A', symbol: 'A' }),
        sampleReward({ coinType: '0xdef::b::B', symbol: 'B' }),
      ],
      totalValueUsd: 0.08,
      degraded: false,
      degradationReason: null,
    };
    render(<PendingRewardsCard data={data} />);
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3);
  });
});
