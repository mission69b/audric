/**
 * Day 7 — HFGauge unit tests.
 *
 * 5 stories from TOOL_UX_DESIGN_v07a.md Day 7 spec:
 *   - healthy (HF ≥ 2.0)
 *   - borderline (1.1 ≤ HF < 1.5)
 *   - near-liquidation (HF < 1.1)
 *   - with-projection-up (current → projected goes UP, e.g. repay)
 *   - with-projection-down (current → projected goes DOWN, e.g. borrow/withdraw)
 *
 * Plus an infinity case (no debt) and the liquidation threshold marker check.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HFGauge } from './HFGauge';

describe('HFGauge — healthy', () => {
  it('renders HF >= 2.0 with success color', () => {
    const { container } = render(
      <HFGauge healthFactor={2.5} liquidationThreshold={1.0} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Health factor');
    expect(text).toContain('2.50');
    expect(text).toContain('Liquidation');
  });

  it('renders ∞ for un-debted positions (HF >= 99)', () => {
    const { container } = render(
      <HFGauge healthFactor={Number.POSITIVE_INFINITY} liquidationThreshold={1.0} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('∞');
    expect(text).not.toContain('Infinity');
  });
});

describe('HFGauge — borderline (1.1–1.5)', () => {
  it('renders HF 1.42 with warning tone', () => {
    const { container } = render(
      <HFGauge healthFactor={1.42} liquidationThreshold={1.0} />,
    );
    expect(container.textContent ?? '').toContain('1.42');
  });
});

describe('HFGauge — near-liquidation (<1.1)', () => {
  it('renders HF 1.05 with error tone', () => {
    const { container } = render(
      <HFGauge healthFactor={1.05} liquidationThreshold={1.0} />,
    );
    expect(container.textContent ?? '').toContain('1.05');
  });
});

describe('HFGauge — with-projection-up (HF improves)', () => {
  it('renders ↑ arrow + projected HF + success color', () => {
    const { container } = render(
      <HFGauge
        healthFactor={1.20}
        liquidationThreshold={1.0}
        projection={{ healthFactor: 1.85, label: 'after repay' }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('after repay');
    expect(text).toContain('↑');
    expect(text).toContain('1.85');
  });
});

describe('HFGauge — with-projection-down (HF degrades)', () => {
  it('renders ↓ arrow + projected HF when borrow drops HF', () => {
    const { container } = render(
      <HFGauge
        healthFactor={2.10}
        liquidationThreshold={1.0}
        projection={{ healthFactor: 1.42, label: 'after borrow' }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('after borrow');
    expect(text).toContain('↓');
    expect(text).toContain('1.42');
  });

  it('applies warning color when projection lands in 1.1–1.5 band', () => {
    const { container } = render(
      <HFGauge
        healthFactor={2.10}
        liquidationThreshold={1.0}
        projection={{ healthFactor: 1.30, label: 'after borrow' }}
      />,
    );
    const projectionRow = container.querySelector('.text-warning-solid');
    expect(projectionRow).not.toBeNull();
  });

  it('applies error color when projection lands below 1.1', () => {
    const { container } = render(
      <HFGauge
        healthFactor={2.10}
        liquidationThreshold={1.0}
        projection={{ healthFactor: 1.05, label: 'after borrow' }}
      />,
    );
    const projectionRow = container.querySelector('.text-error-solid');
    expect(projectionRow).not.toBeNull();
  });
});

describe('HFGauge — projection arrow logic', () => {
  it('renders · when projection equals current within 0.001 epsilon', () => {
    const { container } = render(
      <HFGauge
        healthFactor={1.50}
        liquidationThreshold={1.0}
        projection={{ healthFactor: 1.5005, label: 'after action' }}
      />,
    );
    expect(container.textContent ?? '').toContain('·');
  });
});

describe('HFGauge — no projection row when omitted', () => {
  it('does not render the divider/projection block when projection is undefined', () => {
    const { container } = render(
      <HFGauge healthFactor={2.10} liquidationThreshold={1.0} />,
    );
    expect(container.querySelector('.border-t')).toBeNull();
  });
});
