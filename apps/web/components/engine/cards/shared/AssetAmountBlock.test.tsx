/**
 * Day 6 — AssetAmountBlock unit tests.
 *
 * Convention (per BalanceCard.test.tsx, ConfirmationChip.test.tsx):
 * this codebase does NOT extend `@testing-library/jest-dom` matchers
 * in `vitest.setup.ts`. Tests use raw DOM API (`textContent`,
 * `querySelector`) instead of `toHaveTextContent` / `toBeInTheDocument`.
 *
 * 4 stories from TOOL_UX_DESIGN_v07a.md Day 6 spec:
 *   - stable: USDC, both amount + USD priced
 *   - volatile: SUI, both amount + USD priced
 *   - no-USD: BlockVision degraded → usdValue=null → renders "—"
 *   - with-suffix + with-label: e.g. "DEPOSIT" eyebrow + "· max" trailer
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AssetAmountBlock } from './AssetAmountBlock';

describe('AssetAmountBlock — stable', () => {
  it('renders amount + asset + USD value', () => {
    const { container } = render(
      <AssetAmountBlock asset="USDC" amount={50.25} usdValue={50.24} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('50.25');
    expect(text).toContain('USDC');
    expect(text).toContain('$50.24');
  });

  it('does not render label or suffix when omitted', () => {
    const { container } = render(
      <AssetAmountBlock asset="USDC" amount={50} usdValue={50} />,
    );
    const eyebrow = container.querySelector(
      'span.text-\\[9px\\].font-mono.uppercase',
    );
    expect(eyebrow).toBeNull();
    expect(container.textContent).not.toContain('·');
  });
});

describe('AssetAmountBlock — volatile', () => {
  it('formats sub-1 amounts to 6 decimals (per fmtAmt convention)', () => {
    const { container } = render(
      <AssetAmountBlock asset="SUI" amount={0.123456} usdValue={0.16} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('0.123456');
    expect(text).toContain('SUI');
    expect(text).toContain('$0.16');
  });

  it('formats >=1 amounts to 2 decimals', () => {
    const { container } = render(
      <AssetAmountBlock asset="SUI" amount={19.8073} usdValue={25.97} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('19.81');
    expect(text).toContain('SUI');
    expect(text).toContain('$25.97');
  });
});

describe('AssetAmountBlock — no-USD (degraded pricing)', () => {
  it('renders em-dash when usdValue is null', () => {
    const { container } = render(
      <AssetAmountBlock asset="MANIFEST" amount={3842.62} usdValue={null} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('3,842.62');
    expect(text).toContain('MANIFEST');
    expect(text).toContain('—');
    expect(text).not.toContain('$0.00');
  });
});

describe('AssetAmountBlock — with-label + with-suffix', () => {
  it('renders the label as a small uppercase eyebrow above the amount', () => {
    const { container } = render(
      <AssetAmountBlock
        asset="USDC"
        amount={50}
        usdValue={50}
        label="Deposit"
      />,
    );
    const eyebrow = container.querySelector(
      'span.text-\\[9px\\].font-mono.uppercase',
    );
    expect(eyebrow).not.toBeNull();
    expect(eyebrow?.textContent).toBe('Deposit');
  });

  it('renders the suffix after the USD value', () => {
    const { container } = render(
      <AssetAmountBlock
        asset="USDC"
        amount={50}
        usdValue={50}
        suffix="· max"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('$50.00');
    expect(text).toContain('· max');
  });

  it('renders both label + suffix together', () => {
    const { container } = render(
      <AssetAmountBlock
        asset="USDC"
        amount={50}
        usdValue={50}
        label="Receives"
        suffix="· cached 5m"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Receives');
    expect(text).toContain('$50.00');
    expect(text).toContain('· cached 5m');
  });
});

describe('AssetAmountBlock — logo', () => {
  it('renders the logo img when provided', () => {
    const { container } = render(
      <AssetAmountBlock
        asset="USDC"
        amount={50}
        usdValue={50}
        logo="https://logos.example/usdc.svg"
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://logos.example/usdc.svg');
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('does not render an img when logo is omitted', () => {
    const { container } = render(
      <AssetAmountBlock asset="USDC" amount={50} usdValue={50} />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
