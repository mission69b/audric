/**
 * SPEC 23A-A1 — getResultPreview registry.
 *
 * Acceptance bar from the spec:
 *   "All 25 read tools' ParallelToolsRow.sub returns a non-generic preview
 *    string when called via the parallel grouping path (sample 5 tools
 *    across types: balance_check, swap_quote, mpp_services, web_search,
 *    transaction_history)."
 *
 * Tests below cover the 5 sample tools explicitly + a sweep of the
 * remaining read tools + defensive narrowing edge-cases (null result,
 * missing fields, wrong shape).
 */

import { describe, expect, it } from 'vitest';

import { getResultPreview } from './result-preview';

describe('getResultPreview — sample tools (acceptance bar)', () => {
  it('balance_check: surfaces "$X total · earning $Y" when savings > 0', () => {
    const result = {
      data: {
        total: 2000,
        savings: 11,
        available: 1989,
        isSelfQuery: true,
      },
    };
    expect(getResultPreview('balance_check', result)).toBe(
      '$2,000 total · earning $11.00',
    );
  });

  it('balance_check: drops earning suffix when savings is 0', () => {
    const result = { data: { total: 800, savings: 0, isSelfQuery: true } };
    expect(getResultPreview('balance_check', result)).toBe('$800 total');
  });

  it('balance_check: prefixes subject for watched-address reads', () => {
    const result = {
      data: {
        total: 4500,
        savings: 0,
        isSelfQuery: false,
        suinsName: 'mom.sui',
      },
    };
    expect(getResultPreview('balance_check', result)).toBe('mom.sui · $4,500');
  });

  it('swap_quote: surfaces "fromAmount FROM → toAmount TO · slippage%"', () => {
    // Real engine shape: SwapQuoteResult { fromToken, toToken, fromAmount,
    // toAmount, priceImpact, route } — see packages/sdk/src/types.ts.
    const result = {
      data: {
        fromToken: 'USDC',
        toToken: 'SUI',
        fromAmount: 200,
        toAmount: 212.77,
        priceImpact: 0.0003,
        route: 'CETUS',
      },
    };
    expect(getResultPreview('swap_quote', result)).toBe('200.00 USDC → 212.77 SUI · 0.03%');
  });

  it('swap_quote: returns "no route — refining" on recoverable error', () => {
    const result = {
      data: {
        error: 'No route',
        errorCode: 'SWAP_FAILED',
        hint: 'try smaller amount',
        recoverable: true,
      },
    };
    expect(getResultPreview('swap_quote', result)).toBe('no route — refining');
  });

  it('mpp_services: surfaces "N svcs" (engine doesn\'t expose endpoint count today)', () => {
    // Real engine shape: { services: [...], total: N, mode? } — no
    // `totalEndpoints` field exists today. See packages/engine/src/tools/
    // mpp-services.ts. When SPEC 23B's MPP work surfaces endpoint counts,
    // extend the fitter and this test together.
    const result = {
      data: {
        services: new Array(40).fill({ slug: 'x' }),
        total: 40,
        mode: 'full',
      },
    };
    expect(getResultPreview('mpp_services', result)).toBe('40 svcs');
  });

  it('mpp_services: handles ACI _refine payload (refining…)', () => {
    const result = { data: { _refine: { suggestedQuery: 'narrow it' } } };
    expect(getResultPreview('mpp_services', result)).toBe('refining query…');
  });

  it('mpp_services: pluralisation — "1 svc" not "1 svcs"', () => {
    expect(
      getResultPreview('mpp_services', { data: { services: [{ slug: 'x' }], total: 1 } }),
    ).toBe('1 svc');
  });

  it('web_search: surfaces top result title + derived domain (no `domain` in payload)', () => {
    // Real engine shape: { results: [{title, url, description}, ...] } —
    // there is NO `domain` field. Domain is derived from `url` via URL
    // parsing. See packages/engine/src/tools/web-search.ts.
    const result = {
      data: {
        results: [
          {
            title: 'Blue Bottle 3-month subscription',
            url: 'https://bluebottlecoffee.com/subscriptions/3-month',
            description: '...',
          },
          { title: 'Other result', url: 'https://other.com', description: '...' },
        ],
      },
    };
    expect(getResultPreview('web_search', result)).toBe(
      'Blue Bottle 3-month subscription · bluebottlecoffee.com',
    );
  });

  it('web_search: strips `www.` prefix when deriving domain from URL', () => {
    expect(
      getResultPreview('web_search', {
        data: { results: [{ title: 'Foo', url: 'https://www.example.com/bar', description: '' }] },
      }),
    ).toBe('Foo · example.com');
  });

  it('web_search: returns "no results" on empty array', () => {
    expect(getResultPreview('web_search', { data: { results: [] } })).toBe('no results');
  });

  it('transaction_history: surfaces "N tx · last <duration>"', () => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const result = {
      data: {
        transactions: [
          { timestamp: fiveMinAgo, hash: '0x1' },
          { timestamp: fiveMinAgo - 10000, hash: '0x2' },
        ],
      },
    };
    const preview = getResultPreview('transaction_history', result);
    expect(preview).toMatch(/^2 tx · last \d+m ago$/);
  });
});

describe('getResultPreview — broader read-tool coverage', () => {
  it('rates_info: surfaces top stables APYs', () => {
    const result = {
      data: {
        USDC: { saveApy: 0.046, borrowApy: 0.062 },
        USDsui: { saveApy: 0.084, borrowApy: 0.099 },
      },
    };
    expect(getResultPreview('rates_info', result)).toBe('USDC 4.60% · USDsui 8.40%');
  });

  it('savings_info: surfaces "$X saved · X.XX% APY"', () => {
    const result = {
      data: {
        fundStatus: { supplied: 900, apy: 0.084, earnedToday: 0.21 },
      },
    };
    expect(getResultPreview('savings_info', result)).toBe('$900 saved · 8.40% APY');
  });

  it('savings_info: "no active deposits" when supplied is 0', () => {
    expect(
      getResultPreview('savings_info', { data: { fundStatus: { supplied: 0, apy: 0 } } }),
    ).toBe('no active deposits');
  });

  it('health_check: surfaces "HF X.XX · status"', () => {
    expect(
      getResultPreview('health_check', { data: { healthFactor: 1.42, status: 'safe' } }),
    ).toBe('HF 1.42 · safe');
  });

  it('health_check: handles "no debt" sentinel (HF >= 9999)', () => {
    expect(
      getResultPreview('health_check', { data: { healthFactor: 99999, status: 'safe' } }),
    ).toBe('no debt · safe');
  });

  it('protocol_deep_dive: surfaces "<NAME> · TVL $XM" using `tvl` (not `tvlUsd`)', () => {
    // Real engine field is `tvl` — see packages/engine/src/tools/
    // protocol-deep-dive.ts (interface ProtocolProfile).
    expect(
      getResultPreview('protocol_deep_dive', { data: { name: 'navi', tvl: 48_000_000 } }),
    ).toBe('NAVI · TVL $48M');
  });

  it('volo_stats: surfaces vSUI APY', () => {
    expect(getResultPreview('volo_stats', { data: { apy: 0.042 } })).toBe('vSUI 4.20% APY');
  });

  it('yield_summary: surfaces "+$X/day" using real engine field `today`', () => {
    // Real engine shape: YieldSummary { today, thisWeek, thisMonth, allTime,
    // currentApy, deposited, projectedYear, sparkline } — see
    // packages/engine/src/tools/yield-summary.ts.
    expect(getResultPreview('yield_summary', { data: { today: 0.21 } })).toBe('+$0.21/day');
  });

  it('activity_summary: surfaces "N tx · this <period>" using real engine field', () => {
    // Real engine shape: ActivitySummary { period: 'week'|'month'|'year'|'all',
    // totalTransactions, ... } — see packages/engine/src/tools/activity-summary.ts.
    expect(
      getResultPreview('activity_summary', {
        data: { period: 'month', totalTransactions: 15 },
      }),
    ).toBe('15 tx · this month');
  });

  it('activity_summary: "all time" when period === "all"', () => {
    expect(
      getResultPreview('activity_summary', { data: { period: 'all', totalTransactions: 80 } }),
    ).toBe('80 tx · all time');
  });

  it('pending_rewards: "$X claimable" when totalValueUsd > 0', () => {
    // Real engine field is `totalValueUsd` — see packages/engine/src/tools/
    // pending-rewards.ts.
    expect(getResultPreview('pending_rewards', { data: { totalValueUsd: 4.32 } })).toBe(
      '$4.32 claimable',
    );
  });

  it('pending_rewards: "nothing pending" when 0', () => {
    expect(getResultPreview('pending_rewards', { data: { totalValueUsd: 0 } })).toBe(
      'nothing pending',
    );
  });

  it('resolve_suins: forward direction (name → address)', () => {
    // Real engine shape (forward): { direction: 'forward', query, address,
    // registered } — see packages/engine/src/tools/resolve-suins.ts.
    expect(
      getResultPreview('resolve_suins', {
        data: {
          direction: 'forward',
          query: 'mom.sui',
          address: '0xa3f9000000000000000000000000000000000000000000000000000000000b27c',
          registered: true,
        },
      }),
    ).toBe('mom.sui → 0xa3f9…b27c');
  });

  it('resolve_suins: forward — unregistered name', () => {
    expect(
      getResultPreview('resolve_suins', {
        data: { direction: 'forward', query: 'nope.sui', address: null, registered: false },
      }),
    ).toBe('nope.sui · unregistered');
  });

  it('resolve_suins: reverse direction (address → name)', () => {
    // Real engine shape (reverse): { direction: 'reverse', query, names, primary }.
    expect(
      getResultPreview('resolve_suins', {
        data: {
          direction: 'reverse',
          query: '0xa3f9000000000000000000000000000000000000000000000000000000000b27c',
          names: ['mom.sui'],
          primary: 'mom.sui',
        },
      }),
    ).toBe('0xa3f9…b27c → mom.sui');
  });

  it('token_prices: handles ARRAY shape (engine returns PriceResult[], not an object)', () => {
    // Real engine shape: data: PriceResult[] = [{coinType, symbol, price,
    // change24h?}, ...] — see packages/engine/src/tools/token-prices.ts.
    // Single price → "SYMBOL $X"; multi → "N prices".
    expect(
      getResultPreview('token_prices', {
        data: [{ coinType: '0x...::sui::SUI', symbol: 'SUI', price: 1.49 }],
      }),
    ).toBe('SUI $1.49');
    expect(
      getResultPreview('token_prices', {
        data: [
          { coinType: 'a', symbol: 'SUI', price: 1.49 },
          { coinType: 'b', symbol: 'USDC', price: 1.0 },
          { coinType: 'c', symbol: 'GOLD', price: 0.0046 },
        ],
      }),
    ).toBe('3 prices');
  });

  it('portfolio_analysis: surfaces "$X · N positions" using real engine fields', () => {
    // Real engine shape: { totalValue, walletValue, savingsValue, defiValue,
    // allocations: [...], ... } — see packages/engine/src/tools/portfolio-analysis.ts.
    expect(
      getResultPreview('portfolio_analysis', {
        data: { totalValue: 1500, allocations: [{ asset: 'a' }, { asset: 'b' }, { asset: 'c' }] },
      }),
    ).toBe('$1,500 · 3 positions');
  });

  it('portfolio_analysis: drops positions suffix when allocations empty', () => {
    // fmtUsd($80) → "$80.00" (the >=$1 band uses toFixed(2); the >=$100
    // band drops cents).
    expect(
      getResultPreview('portfolio_analysis', { data: { totalValue: 80, allocations: [] } }),
    ).toBe('$80.00 total');
  });

  it('spending_analytics: real engine fields (totalSpent + requestCount)', () => {
    expect(
      getResultPreview('spending_analytics', {
        data: { totalSpent: 12.5, requestCount: 8, period: 'month' },
      }),
    ).toBe('$12.50 spent · 8 reqs');
  });

  it('rates_info: case-insensitive symbol matching (engine returns USDSUI uppercase)', () => {
    // Real NAVI rates payload returns symbols as-is from the pool list,
    // which can be 'USDSUI' (newer pools) or 'USDsui' (engine aliases).
    // Fitter must match case-insensitively. See packages/engine/src/navi/transforms.ts.
    expect(
      getResultPreview('rates_info', {
        data: {
          USDC: { saveApy: 0.046, borrowApy: 0.062 },
          USDSUI: { saveApy: 0.084, borrowApy: 0.099 }, // ← UPPERCASE
        },
      }),
    ).toBe('USDC 4.60% · USDsui 8.40%');
  });

  it('create_invoice: surfaces "$X · label" using real engine fields', () => {
    // Real engine shape: { slug, url, amount, currency, label, dueDate, ... }
    // — see packages/engine/src/tools/receive.ts createInvoiceTool.
    expect(
      getResultPreview('create_invoice', {
        data: { slug: 'inv-1', url: '...', amount: 250, currency: 'USDC', label: 'Web design' },
      }),
    ).toBe('$250 · Web design');
  });

  it('create_payment_link: returns the URL minus protocol', () => {
    expect(
      getResultPreview('create_payment_link', { data: { url: 'https://audric.ai/pay/abc123' } }),
    ).toBe('audric.ai/pay/abc123');
  });

  it('list_payment_links: surfaces "N active links"', () => {
    expect(
      getResultPreview('list_payment_links', { data: { links: [{ id: 'a' }, { id: 'b' }] } }),
    ).toBe('2 active links');
  });

  it('cancel_payment_link: returns static "link cancelled"', () => {
    expect(getResultPreview('cancel_payment_link', { data: {} })).toBe('link cancelled');
  });

  it('explain_tx: returns the summary verbatim (truncated when long)', () => {
    const long = 'a'.repeat(80);
    expect(getResultPreview('explain_tx', { data: { summary: 'short summary' } })).toBe(
      'short summary',
    );
    expect((getResultPreview('explain_tx', { data: { summary: long } }) ?? '').length).toBe(54);
  });
});

describe('getResultPreview — defensive narrowing', () => {
  it('returns undefined for unknown tools', () => {
    expect(getResultPreview('this_tool_does_not_exist', { data: { foo: 'bar' } })).toBeUndefined();
  });

  it('returns undefined when result is null', () => {
    expect(getResultPreview('balance_check', null)).toBeUndefined();
  });

  it('returns undefined when data field is missing the expected shape', () => {
    expect(getResultPreview('balance_check', { data: { foo: 'wrong-shape' } })).toBeUndefined();
  });

  it('returns undefined when data is not an object (string / number / array)', () => {
    expect(getResultPreview('balance_check', { data: 'oops' })).toBeUndefined();
    expect(getResultPreview('balance_check', { data: [1, 2, 3] })).toBeUndefined();
    expect(getResultPreview('balance_check', { data: 42 })).toBeUndefined();
  });

  it('does not crash when result is missing the `data` envelope (raw payload)', () => {
    // When called with the data shape directly (no `{data,displayText}` envelope)
    // the registry's extractData returns the input unchanged.
    expect(getResultPreview('balance_check', { total: 100, savings: 0 })).toBe('$100 total');
  });

  it('balance_check: pending_rewards "$X claimable" formats cents correctly', () => {
    expect(getResultPreview('pending_rewards', { data: { totalValueUsd: 4.32 } })).toBe(
      '$4.32 claimable',
    );
  });
});
