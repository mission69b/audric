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
 *
 * IMPORTANT — engine emit shape: `priceImpact` is a DECIMAL (Cetus
 * `deviationRatio` semantics) — `0.0042` means 0.42%, NOT `0.42`.
 * Pre-audit fixtures used raw percentages (`0.42`) which let V2 silently
 * misinterpret real engine values. Days 10-16 audit fix landed
 * `priceImpactToPct()` heuristic + rewrites these fixtures to match
 * real engine emit shape. See `swap-quote.ts:138` (engine displayText)
 * and `cetus-swap.test.ts` (SDK fixtures consistently `0.0019` / `0.001`).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SwapQuoteCardV2, type SwapQuoteV2Data } from './SwapQuoteCardV2';

const baseData: SwapQuoteV2Data = {
  fromToken: 'SUI',
  toToken: 'USDC',
  fromAmount: 10,
  toAmount: 13.7,
  priceImpact: 0.0042, // ENGINE EMIT SHAPE: decimal (= 0.42%)
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

  it('renders impact percentage with primary color when < 1% (engine decimal)', () => {
    const { container } = render(<SwapQuoteCardV2 data={baseData} />);
    // baseData.priceImpact = 0.0042 (decimal) → 0.42% rendered
    expect(container.textContent ?? '').toContain('0.42%');
    expect(container.querySelector('.text-error-solid')).toBeNull();
    expect(container.querySelector('.text-warning-solid')).toBeNull();
  });

  it('renders impact in warning tone when 1-3% (engine decimal)', () => {
    const { container } = render(
      <SwapQuoteCardV2 data={{ ...baseData, priceImpact: 0.018 }} />, // 1.8%
    );
    expect(container.textContent ?? '').toContain('1.80%');
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('renders impact in error tone when > 3% (engine decimal)', () => {
    const { container } = render(
      <SwapQuoteCardV2 data={{ ...baseData, priceImpact: 0.052 }} />, // 5.2%
    );
    expect(container.textContent ?? '').toContain('5.20%');
    expect(container.querySelector('.text-error-solid')).not.toBeNull();
  });

  it('honors the >=1 fallback when a historical raw-percentage payload arrives', () => {
    // Defensive: if some upstream path ships a raw percentage like `1.8`
    // instead of the engine's canonical decimal `0.018`, the heuristic
    // treats values >= 1 as already-percentage and renders them verbatim.
    const { container } = render(
      <SwapQuoteCardV2 data={{ ...baseData, priceImpact: 1.8 }} />,
    );
    expect(container.textContent ?? '').toContain('1.80%');
    expect(container.querySelector('.text-warning-solid')).not.toBeNull();
  });

  it('does NOT crash when priceImpact arrives as a non-numeric string (defensive)', () => {
    const bad = { ...baseData, priceImpact: 'oops' as unknown as number };
    const { container } = render(<SwapQuoteCardV2 data={bad} />);
    expect(container.textContent ?? '').toContain('0.00%');
  });

  it('clamps negative priceImpact to 0%', () => {
    const negative = { ...baseData, priceImpact: -0.001 };
    const { container } = render(<SwapQuoteCardV2 data={negative} />);
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
