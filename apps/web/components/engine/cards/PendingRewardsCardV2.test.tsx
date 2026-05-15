/**
 * SPEC 37 v0.7a Phase 2 Day 16 — PendingRewardsCardV2 unit tests.
 *
 * Convention: raw DOM API only — `textContent`, `querySelector`.
 *
 * Coverage:
 *   - 3 v1 render states preserved: degraded, empty, list
 *   - List: AssetAmountBlock per reward, sorted by USD desc, multi-protocol
 *     eyebrow when rewards span > 1 protocol, total claimable footer
 *   - Degraded: warning state with protocol-aware headline
 *   - Empty: quiet "No claimable rewards yet"
 *   - usdValue=null AssetAmountBlock fallback when reward has $0 estimate
 *   - Total footer hidden when totalValueUsd is 0
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  PendingRewardsCardV2,
  type PendingRewardsCardV2Data,
} from './PendingRewardsCardV2';

const baseRewards: PendingRewardsCardV2Data = {
  rewards: [
    {
      protocol: 'NAVI',
      asset: 'vSUI',
      coinType: '0xa::vsui::VSUI',
      symbol: 'vSUI',
      amount: 0.0165,
      estimatedValueUsd: 0.04,
    },
    {
      protocol: 'NAVI',
      asset: 'NAVX',
      coinType: '0xb::navx::NAVX',
      symbol: 'NAVX',
      amount: 12.5,
      estimatedValueUsd: 1.20,
    },
  ],
  totalValueUsd: 1.24,
  degraded: false,
  degradationReason: null,
};

describe('PendingRewardsCardV2 — list state', () => {
  it('renders the "Pending rewards" header chrome', () => {
    const { container } = render(<PendingRewardsCardV2 data={baseRewards} />);
    expect(container.textContent).toContain('Pending rewards');
  });

  it('renders an AssetAmountBlock per reward (sorted by USD desc)', () => {
    const { container } = render(<PendingRewardsCardV2 data={baseRewards} />);
    const text = container.textContent ?? '';
    // NAVX ($1.20) > vSUI ($0.04) → NAVX first.
    const navxIdx = text.indexOf('NAVX');
    const vsuiIdx = text.indexOf('vSUI');
    expect(navxIdx).toBeLessThan(vsuiIdx);
  });

  it('renders amount + USD for each reward', () => {
    const { container } = render(<PendingRewardsCardV2 data={baseRewards} />);
    const text = container.textContent ?? '';
    expect(text).toContain('NAVX');
    expect(text).toContain('12.50');
    expect(text).toContain('$1.20');
    expect(text).toContain('vSUI');
    expect(text).toContain('$0.04');
  });

  it('renders the "Total claimable" footer', () => {
    const { container } = render(<PendingRewardsCardV2 data={baseRewards} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Total claimable');
    expect(text).toContain('$1.24');
  });

  it('hides the total footer when totalValueUsd is 0', () => {
    const noTotal: PendingRewardsCardV2Data = {
      ...baseRewards,
      totalValueUsd: 0,
    };
    const { container } = render(<PendingRewardsCardV2 data={noTotal} />);
    expect(container.textContent ?? '').not.toContain('Total claimable');
  });

  it('renders em-dash for rewards with no USD estimate (degraded pricing)', () => {
    const partial: PendingRewardsCardV2Data = {
      ...baseRewards,
      rewards: [
        {
          protocol: 'NAVI',
          asset: 'OBSCURE',
          coinType: '0xc::obscure::OBSCURE',
          symbol: 'OBSCURE',
          amount: 100,
          estimatedValueUsd: 0,
        },
      ],
      totalValueUsd: 0,
    };
    const { container } = render(<PendingRewardsCardV2 data={partial} />);
    expect(container.textContent ?? '').toContain('—');
  });

  it('does NOT render protocol eyebrow when all rewards share one protocol', () => {
    const { container } = render(<PendingRewardsCardV2 data={baseRewards} />);
    // baseRewards is all NAVI — eyebrow label should not appear above amounts.
    const eyebrows = container.querySelectorAll(
      'span.text-\\[9px\\].font-mono.uppercase',
    );
    // Footer "Total claimable" eyebrow IS present, but no per-row protocol
    // eyebrows. Footer is rendered inside its own block — we verify there
    // are no eyebrows above the AssetAmountBlock rows.
    const text = container.textContent ?? '';
    // The protocol eyebrow would be the literal "NAVI" text appearing as a
    // tracked-uppercase label. Since baseRewards is single-protocol, the
    // string "NAVI" should NOT appear in the rendered text at all.
    expect(text).not.toContain('NAVI');
    // Sanity: at least the total-claimable eyebrow is in the DOM.
    expect(eyebrows.length).toBeGreaterThanOrEqual(1);
  });

  it('renders protocol eyebrow when multi-protocol rewards', () => {
    const multi: PendingRewardsCardV2Data = {
      rewards: [
        {
          protocol: 'NAVI',
          asset: 'NAVX',
          coinType: '0xb::navx::NAVX',
          symbol: 'NAVX',
          amount: 12.5,
          estimatedValueUsd: 1.20,
        },
        {
          protocol: 'Suilend',
          asset: 'SEND',
          coinType: '0xd::send::SEND',
          symbol: 'SEND',
          amount: 5,
          estimatedValueUsd: 0.50,
        },
      ],
      totalValueUsd: 1.70,
      degraded: false,
      degradationReason: null,
    };
    const { container } = render(<PendingRewardsCardV2 data={multi} />);
    const text = container.textContent ?? '';
    expect(text).toContain('NAVI');
    expect(text).toContain('Suilend');
  });
});

describe('PendingRewardsCardV2 — empty state', () => {
  it('renders "No claimable rewards yet" when rewards array is empty', () => {
    const empty: PendingRewardsCardV2Data = {
      rewards: [],
      totalValueUsd: 0,
      degraded: false,
      degradationReason: null,
    };
    const { container } = render(<PendingRewardsCardV2 data={empty} />);
    expect(container.textContent ?? '').toContain('No claimable rewards yet');
  });
});

describe('PendingRewardsCardV2 — degraded state', () => {
  it('renders the NAVI-specific headline for PROTOCOL_UNAVAILABLE', () => {
    const degraded: PendingRewardsCardV2Data = {
      rewards: [],
      totalValueUsd: 0,
      degraded: true,
      degradationReason: 'PROTOCOL_UNAVAILABLE',
    };
    const { container } = render(<PendingRewardsCardV2 data={degraded} />);
    const text = container.textContent ?? '';
    expect(text).toContain('NAVI rewards lookup unavailable');
    expect(text).toContain("aren't lost");
  });

  it('renders the generic headline for UNKNOWN reason', () => {
    const degraded: PendingRewardsCardV2Data = {
      rewards: [],
      totalValueUsd: 0,
      degraded: true,
      degradationReason: 'UNKNOWN',
    };
    const { container } = render(<PendingRewardsCardV2 data={degraded} />);
    expect(container.textContent ?? '').toContain('Rewards lookup failed');
  });

  it('renders the generic headline when degradationReason is null', () => {
    const degraded: PendingRewardsCardV2Data = {
      rewards: [],
      totalValueUsd: 0,
      degraded: true,
      degradationReason: null,
    };
    const { container } = render(<PendingRewardsCardV2 data={degraded} />);
    expect(container.textContent ?? '').toContain('Rewards lookup failed');
  });
});
