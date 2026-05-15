/**
 * SPEC 37 v0.7a Phase 2 Day 12-13 — SwapQuoteCardV2 unit tests.
 *
 * Convention: raw DOM API only — `textContent`, `querySelector`.
 *
 * Coverage:
 *   - Header: trade direction (X → Y)
 *   - Pay/Receive AssetAmountBlock pair, USD when present, em-dash when null
 *   - RouteDiagram when routeSteps array is supplied (1-hop, 2-hop)
 *   - Single-string `route` fallback when routeSteps absent
 *   - "via" caption hidden when both routeSteps and route are absent
 *   - Rate / impact / slippage / fee detail rows
 *   - Impact color tiers (<1% primary, 1-3% warning, >3% error)
 *   - Defensive: priceImpact as string still renders without crashing
 *   - Slippage row hidden when slippage prop is absent
 *   - Total fee bps default (10) and override
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SwapQuoteCardV2, type SwapQuoteV2Data } from './SwapQuoteCardV2';

const baseData: SwapQuoteV2Data = {
  fromToken: 'SUI',
  toToken: 'USDC',
  fromAmount: 10,
  toAmount: 13.7,
  priceImpact: 0.42,
};

describe('SwapQuoteCardV2 — header', () => {
  it('renders trade direction in the card header', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    expect(container.textContent).toContain('Trade SUI → USDC');
  });
});

describe('SwapQuoteCardV2 — leg AssetAmountBlocks', () => {
  it('renders Pay leg with from-token + amount', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Pay');
    expect(text).toContain('SUI');
    expect(text).toContain('10.00');
  });

  it('renders Receive leg with to-token + amount', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Receive');
    expect(text).toContain('USDC');
    expect(text).toContain('13.70');
  });

  it('renders em-dash for legs when USD value is missing', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    // baseData omits fromUsdValue + toUsdValue → both legs render —.
    const dashCount = (text.match(/—/g) ?? []).length;
    expect(dashCount).toBeGreaterThanOrEqual(2);
  });

  it('renders USD value when fromUsdValue + toUsdValue are supplied', () => {
    const priced: SwapQuoteV2Data = {
      ...baseData,
      fromUsdValue: 13.10,
      toUsdValue: 13.70,
    };
    const { container } = render(<SwapQuoteCardV2 data={priced} />);
    const text = container.textContent ?? '';
    expect(text).toContain('$13.10');
    expect(text).toContain('$13.70');
    expect(text).not.toContain('—');
  });
});

describe('SwapQuoteCardV2 — route rendering', () => {
  it('renders RouteDiagram when routeSteps are supplied (2-hop)', () => {
    const multiHop: SwapQuoteV2Data = {
      ...baseData,
      routeSteps: [
        { pool: 'Cetus', fromAsset: 'SUI', toAsset: 'USDsui', fee: '0.05%' },
        { pool: 'Aftermath', fromAsset: 'USDsui', toAsset: 'USDC', fee: '0.30%' },
      ],
      totalFeeBps: 35,
    };
    const { container } = render(<SwapQuoteCardV2 data={multiHop} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Cetus');
    expect(text).toContain('Aftermath');
    expect(text).toContain('USDsui');
    expect(text).toContain('Total route fee');
    // Total of 0.35% from totalFeeBps 35
    expect(text).toContain('0.35%');
  });

  it('falls back to "via {route}" caption when routeSteps absent + route present', () => {
    const stringRoute: SwapQuoteV2Data = {
      ...baseData,
      route: 'Cetus + Aftermath',
    };
    const { container } = render(<SwapQuoteCardV2 data={stringRoute} />);
    const text = container.textContent ?? '';
    expect(text).toContain('via Cetus + Aftermath');
    // Sanity: no RouteDiagram chrome
    expect(text).not.toContain('Total route fee');
  });

  it('renders neither RouteDiagram nor "via" caption when both routeSteps and route are absent', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    expect(container.textContent ?? '').not.toContain('via');
    expect(container.textContent ?? '').not.toContain('Total route fee');
  });
});

describe('SwapQuoteCardV2 — details', () => {
  it('renders the rate row with computed exchange rate', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Rate');
    // 13.7 / 10 = 1.37
    expect(text).toContain('1 SUI = 1.3700 USDC');
  });

  it('renders impact percentage with primary color when < 1%', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    expect(container.textContent ?? '').toContain('0.42%');
    // No warning/error span — impact text should NOT have those colors
    expect(container.querySelector('.text-error-solid')).toBeNull();
    expect(container.querySelector('.text-warning-solid')).toBeNull();
  });

  it('renders impact in warning tone when 1-3%', () => {
    const { container } = render(
      <SwapQuoteCardV2 data={{ ...baseData, priceImpact: 1.8 }} />,
    );
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('renders impact in error tone when > 3%', () => {
    const { container } = render(
      <SwapQuoteCardV2 data={{ ...baseData, priceImpact: 5.2 }} />,
    );
    expect(container.querySelector('.text-error-solid')).not.toBeNull();
  });

  it('does NOT crash when priceImpact arrives as a non-numeric string (defensive)', () => {
    const bad = { ...baseData, priceImpact: 'oops' as unknown as number };
    const { container } = render(<SwapQuoteCardV2 data={bad} />);
    // Falls back to 0.00% — chat error boundary stays intact.
    expect(container.textContent ?? '').toContain('0.00%');
  });

  it('renders the slippage row when slippage is supplied', () => {
    const withSlip: SwapQuoteV2Data = {
      ...baseData,
      slippage: 0.005, // 0.5%
    };
    const { container } = render(<SwapQuoteCardV2 data={withSlip} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Slippage');
    expect(text).toContain('0.5%');
  });

  it('hides the slippage row when slippage is absent', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    expect(container.textContent ?? '').not.toContain('Slippage');
  });

  it('renders fee using totalFeeBps default of 10 (0.10% overlay)', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    expect(container.textContent ?? '').toContain('0.10% overlay');
  });

  it('honors totalFeeBps override', () => {
    const customFee: SwapQuoteV2Data = { ...baseData, totalFeeBps: 35 };
    const { container } = render(<SwapQuoteCardV2 data={customFee} />);
    expect(container.textContent ?? '').toContain('0.35% overlay');
  });
});

describe('SwapQuoteCardV2 — footer', () => {
  it('renders the quote-validity caption', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    expect(container.textContent ?? '').toContain('Quote valid for ~30 seconds');
  });
});
