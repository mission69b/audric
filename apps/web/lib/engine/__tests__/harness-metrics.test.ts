import { describe, it, expect } from 'vitest';
import { detectRefinement, detectTruncation } from '../harness-metrics';

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
