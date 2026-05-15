/**
 * Day 8 — RouteDiagram unit tests.
 *
 * 3 stories from TOOL_UX_DESIGN_v07a.md Day 8 spec:
 *   - 1-hop  (single pool, e.g. USDC → SUI via Cetus)
 *   - 2-hop  (two pools, e.g. SUI → USDC → DEEP via Cetus + Aftermath)
 *   - 3-hop  (three pools — covers harvest_rewards multi-leg compound)
 *
 * Plus the empty-steps guard.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RouteDiagram } from './RouteDiagram';

describe('RouteDiagram — 1-hop', () => {
  it('renders FROM → TO with the single pool/fee chip', () => {
    const { container } = render(
      <RouteDiagram
        steps={[
          { pool: 'Cetus', fromAsset: 'USDC', toAsset: 'SUI', fee: '0.05%' },
        ]}
        totalFeeBps={5}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('USDC');
    expect(text).toContain('SUI');
    expect(text).toContain('Cetus');
    expect(text).toContain('0.05%');
    expect(text).toContain('Total route fee');
    expect(text).toContain('0.05%');
  });
});

describe('RouteDiagram — 2-hop', () => {
  it('renders A → B → C with both pools and a single total-fee summary', () => {
    const { container } = render(
      <RouteDiagram
        steps={[
          { pool: 'Cetus', fromAsset: 'SUI', toAsset: 'USDC', fee: '0.05%' },
          { pool: 'Aftermath', fromAsset: 'USDC', toAsset: 'DEEP', fee: '0.30%' },
        ]}
        totalFeeBps={35}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('SUI');
    expect(text).toContain('USDC');
    expect(text).toContain('DEEP');
    expect(text).toContain('Cetus');
    expect(text).toContain('Aftermath');
    expect(text).toContain('0.35%');
  });

  it('renders the mid-asset (USDC) exactly once even though it bridges two legs', () => {
    const { container } = render(
      <RouteDiagram
        steps={[
          { pool: 'Cetus', fromAsset: 'SUI', toAsset: 'USDC', fee: '0.05%' },
          { pool: 'Aftermath', fromAsset: 'USDC', toAsset: 'DEEP', fee: '0.30%' },
        ]}
        totalFeeBps={35}
      />,
    );
    const pills = container.querySelectorAll(
      'span.inline-flex.items-center.px-2.py-0\\.5',
    );
    expect(pills.length).toBe(3);
    expect(pills[0]?.textContent).toBe('SUI');
    expect(pills[1]?.textContent).toBe('USDC');
    expect(pills[2]?.textContent).toBe('DEEP');
  });
});

describe('RouteDiagram — 3-hop', () => {
  it('renders four pills + three pool chips', () => {
    const { container } = render(
      <RouteDiagram
        steps={[
          { pool: 'Cetus', fromAsset: 'NAVX', toAsset: 'SUI', fee: '0.30%' },
          { pool: 'Cetus', fromAsset: 'SUI', toAsset: 'USDC', fee: '0.05%' },
          { pool: 'Cetus', fromAsset: 'USDC', toAsset: 'DEEP', fee: '0.30%' },
        ]}
        totalFeeBps={65}
      />,
    );
    const pills = container.querySelectorAll(
      'span.inline-flex.items-center.px-2.py-0\\.5',
    );
    expect(pills.length).toBe(4);
    expect(container.textContent ?? '').toContain('0.65%');
  });
});

describe('RouteDiagram — empty steps guard', () => {
  it('renders nothing when steps is empty', () => {
    const { container } = render(
      <RouteDiagram steps={[]} totalFeeBps={0} />,
    );
    expect(container.textContent).toBe('');
  });
});
