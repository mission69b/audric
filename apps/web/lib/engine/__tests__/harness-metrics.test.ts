import { describe, it, expect } from 'vitest';
import {
  detectRefinement,
  detectTruncation,
  containsMarkdownTable,
  detectNarrationTableDump,
  CARD_RENDERING_TOOLS,
} from '../harness-metrics';

describe('detectRefinement — post-0.47 (counts both _refine and truncation signals)', () => {
  describe('explicit _refine shapes', () => {
    it('detects top-level _refine (mpp_services / defillama_yield_pools no-filter path)', () => {
      expect(detectRefinement({ _refine: { reason: 'too broad' } })).toBe(true);
    });

    it('detects nested data._refine', () => {
      expect(detectRefinement({ data: { _refine: { reason: 'narrow' }, categories: [] } })).toBe(true);
    });

    it('detects refinementSuggested / refinementRequired', () => {
      expect(detectRefinement({ refinementSuggested: true })).toBe(true);
      expect(detectRefinement({ refinementRequired: true })).toBe(true);
    });
  });

  describe('truncation signals (NEW in 0.47)', () => {
    it('detects top-level _truncated: true (from budgetToolResult)', () => {
      expect(detectRefinement({ _truncated: true, _preview: 'foo', _note: 'bar' })).toBe(true);
    });

    it('detects nested data._truncated: true', () => {
      expect(detectRefinement({ data: { _truncated: true, _preview: 'foo' } })).toBe(true);
    });

    it('detects _originalCount (from summarizeOnTruncate in transaction_history)', () => {
      expect(detectRefinement({ _originalCount: 200, transactions: [] })).toBe(true);
    });

    it('detects nested data._originalCount', () => {
      expect(detectRefinement({ data: { _originalCount: 50, transactions: [] } })).toBe(true);
    });
  });

  describe('non-refinement results (must not trigger)', () => {
    it('plain success result returns false', () => {
      expect(detectRefinement({ data: { transactions: [{ id: '1' }] } })).toBe(false);
    });

    it('null / undefined / primitives return false', () => {
      expect(detectRefinement(null)).toBe(false);
      expect(detectRefinement(undefined)).toBe(false);
      expect(detectRefinement('hello')).toBe(false);
      expect(detectRefinement(42)).toBe(false);
    });

    it('_truncated: false does not trigger', () => {
      expect(detectRefinement({ _truncated: false })).toBe(false);
    });

    it('_originalCount as string (malformed) does not trigger', () => {
      expect(detectRefinement({ _originalCount: '200' })).toBe(false);
    });
  });
});

describe('detectTruncation — unchanged (string marker check)', () => {
  it('detects [Truncated marker', () => {
    expect(detectTruncation('some result [Truncated to 8000 chars]')).toBe(true);
  });

  it('detects "Truncated —" marker', () => {
    expect(detectTruncation({ note: 'Truncated — original was 10000 chars' })).toBe(true);
  });

  it('returns false for normal results', () => {
    expect(detectTruncation({ data: { x: 1 } })).toBe(false);
  });
});

describe('containsMarkdownTable — v0.46.6 narration-dump detector', () => {
  it('detects classic markdown table with header divider', () => {
    const text = `Here are your rates:

| Asset | Save APY | Borrow APY |
|-------|----------|------------|
| USDC  | 3.96%    | 3.57%      |
| SUI   | 2.71%    | 1.84%      |

Let me know if you want more.`;
    expect(containsMarkdownTable(text)).toBe(true);
  });

  it('detects bare divider row', () => {
    expect(containsMarkdownTable('|---|---|---|')).toBe(true);
  });

  it('detects divider with alignment colons', () => {
    expect(containsMarkdownTable('| :--- | :---: | ---: |')).toBe(true);
  });

  it('does NOT trigger on prose with single pipes', () => {
    expect(containsMarkdownTable('Use `|` to separate fields')).toBe(false);
    expect(containsMarkdownTable('Result: a | b | c')).toBe(false);
  });

  it('does NOT trigger on a single dashed line (not a table)', () => {
    expect(containsMarkdownTable('---')).toBe(false);
    expect(containsMarkdownTable('-----')).toBe(false);
  });

  it('does NOT trigger on empty narration', () => {
    expect(containsMarkdownTable('')).toBe(false);
  });
});

describe('detectNarrationTableDump — card tool + table = violation', () => {
  it('flags violation when balance_check fired and narration has a table', () => {
    const narration = `Your wallet:

| Asset | Amount |
|-------|--------|
| USDC  | 92.34  |
| SUI   | 8.33   |
`;
    const report = detectNarrationTableDump(narration, ['balance_check']);
    expect(report.violated).toBe(true);
    expect(report.cardTool).toBe('balance_check');
  });

  it('flags violation when rates_info fired and narration has a table', () => {
    const narration = `Top NAVI rates:

| Asset | Save | Borrow |
|---|---|---|
| USDC | 3.96% | 3.57% |
`;
    const report = detectNarrationTableDump(narration, ['rates_info']);
    expect(report.violated).toBe(true);
    expect(report.cardTool).toBe('rates_info');
  });

  it('flags violation for transaction_history table dump', () => {
    const narration = `Here are your transactions over $5:

| Date | Action | Amount |
|---|---|---|
| Apr 19 | send | 5.00 USDC |
`;
    const report = detectNarrationTableDump(narration, ['transaction_history']);
    expect(report.violated).toBe(true);
  });

  it('flags violation for mpp_services full-catalog dump', () => {
    const narration = `Full MPP catalog:

| Service | Category | Price |
|---|---|---|
| weather | weather | $0.001 |
`;
    const report = detectNarrationTableDump(narration, ['mpp_services']);
    expect(report.violated).toBe(true);
  });

  it('does NOT flag when no card tool was called (text-only chat is fine)', () => {
    const narration = `Quick comparison:

| A | B |
|---|---|
| 1 | 2 |
`;
    const report = detectNarrationTableDump(narration, ['web_search']);
    expect(report.violated).toBe(false);
  });

  it('does NOT flag when card tool fired but narration is clean prose', () => {
    const narration = 'Your USDC sits idle — depositing it would 10x your daily yield.';
    const report = detectNarrationTableDump(narration, ['balance_check']);
    expect(report.violated).toBe(false);
  });

  it('does NOT flag when narration is empty', () => {
    const report = detectNarrationTableDump('', ['balance_check']);
    expect(report.violated).toBe(false);
  });

  it('CARD_RENDERING_TOOLS set covers all expected tools', () => {
    expect(CARD_RENDERING_TOOLS.has('balance_check')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('savings_info')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('health_check')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('transaction_history')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('rates_info')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('mpp_services')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('defillama_yield_pools')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('web_search')).toBe(false);
    expect(CARD_RENDERING_TOOLS.has('pay_api')).toBe(false);
  });
});
