import { describe, it, expect } from 'vitest';
import { buildWordSpans, indexAtTime } from '../word-alignment';

describe('buildWordSpans', () => {
  it('builds one span per whitespace-separated word with attached punctuation', () => {
    const text = 'Hello world!';
    // Char-level alignment as ElevenLabs would return it: every char has a
    // start time. We use evenly spaced 50ms intervals for readability.
    const characters = text.split('');
    const startTimes = characters.map((_, i) => i * 0.05);

    const spans = buildWordSpans(characters, startTimes);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({
      word: 'Hello',
      startSec: 0,
      charStart: 0,
      charEnd: 5,
    });
    expect(spans[1].word).toBe('world!');
    expect(spans[1].charStart).toBe(6);
    expect(spans[1].charEnd).toBe(12);
    // index 6 (after the space) × 0.05 — float-tolerant comparison
    expect(spans[1].startSec).toBeCloseTo(0.3, 5);
  });

  it('handles leading whitespace by deferring the first span until the first non-whitespace char', () => {
    const text = '  Hi';
    const characters = text.split('');
    const startTimes = [0, 0.05, 0.1, 0.15];

    const spans = buildWordSpans(characters, startTimes);

    expect(spans).toEqual([
      { word: 'Hi', startSec: 0.1, charStart: 2, charEnd: 4 },
    ]);
  });

  it('handles trailing whitespace by terminating the final span correctly', () => {
    const text = 'Bye  ';
    const characters = text.split('');
    const startTimes = [0, 0.05, 0.1, 0.15, 0.2];

    const spans = buildWordSpans(characters, startTimes);

    expect(spans).toEqual([
      { word: 'Bye', startSec: 0, charStart: 0, charEnd: 3 },
    ]);
  });

  it('returns no spans for whitespace-only input', () => {
    expect(buildWordSpans('   '.split(''), [0, 0.05, 0.1])).toEqual([]);
  });

  it('returns no spans for empty input', () => {
    expect(buildWordSpans([], [])).toEqual([]);
  });

  it('returns no spans when characters and startTimes have mismatched lengths', () => {
    // Defensive against malformed ElevenLabs responses for unusual inputs.
    expect(buildWordSpans(['a', 'b'], [0])).toEqual([]);
  });

  it('treats newlines and tabs as whitespace separators', () => {
    const text = 'a\nb\tc';
    const characters = text.split('');
    const startTimes = [0, 0.05, 0.1, 0.15, 0.2];

    const spans = buildWordSpans(characters, startTimes);

    expect(spans.map((s) => s.word)).toEqual(['a', 'b', 'c']);
  });

  it('preserves crypto-jargon spellings end-to-end', () => {
    // Regression for the "vSUI / NAVI" UX requirement: when ElevenLabs
    // gets the text "Claimed 0.0165 vSUI from NAVI", the spans should
    // surface those tokens verbatim so the highlight matches exactly.
    const text = 'Claimed 0.0165 vSUI from NAVI';
    const characters = text.split('');
    const startTimes = characters.map((_, i) => i * 0.04);

    const spans = buildWordSpans(characters, startTimes);

    expect(spans.map((s) => s.word)).toEqual([
      'Claimed',
      '0.0165',
      'vSUI',
      'from',
      'NAVI',
    ]);
  });
});

describe('indexAtTime', () => {
  const spans = [
    { word: 'one', startSec: 0.0, charStart: 0, charEnd: 3 },
    { word: 'two', startSec: 0.5, charStart: 4, charEnd: 7 },
    { word: 'three', startSec: 1.2, charStart: 8, charEnd: 13 },
    { word: 'four', startSec: 2.0, charStart: 14, charEnd: 18 },
  ];

  it('returns -1 before the first word starts', () => {
    expect(indexAtTime(spans, -0.5)).toBe(-1);
  });

  it('returns 0 exactly at the first word start', () => {
    expect(indexAtTime(spans, 0)).toBe(0);
  });

  it('returns the index of the most recently spoken word', () => {
    expect(indexAtTime(spans, 0.4)).toBe(0);
    expect(indexAtTime(spans, 0.5)).toBe(1);
    expect(indexAtTime(spans, 1.5)).toBe(2);
    expect(indexAtTime(spans, 5.0)).toBe(3);
  });

  it('returns -1 for an empty spans array', () => {
    expect(indexAtTime([], 1)).toBe(-1);
  });
});
