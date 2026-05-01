// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — Voice slice tests (audit Gap F)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  computeTextBlockVoiceSlices,
  localSpokenWordIndex,
} from '@/lib/voice/timeline-voice-slices';
import type { TimelineBlock } from '@/lib/engine-types';
import type { WordSpan } from '@/lib/voice/word-alignment';

function span(word: string, charStart: number, charEnd: number, startSec = 0): WordSpan {
  return { word, charStart, charEnd, startSec };
}

describe('computeTextBlockVoiceSlices', () => {
  it('returns empty map when no spans are provided', () => {
    const blocks: TimelineBlock[] = [
      { type: 'text', text: 'hello world', status: 'done' },
    ];
    const result = computeTextBlockVoiceSlices(blocks, []);
    expect(result.size).toBe(0);
  });

  it('keys the slice by block reference for a single text block', () => {
    const block: TimelineBlock = { type: 'text', text: 'hello world', status: 'done' };
    const blocks: TimelineBlock[] = [block];
    const spans: WordSpan[] = [span('hello', 0, 5), span('world', 6, 11)];
    const result = computeTextBlockVoiceSlices(blocks, spans);

    expect(result.get(block)).toBeDefined();
    expect(result.get(block)?.firstGlobalWordIdx).toBe(0);
    expect(result.get(block)?.localSpans).toEqual([
      { word: 'hello', charStart: 0, charEnd: 5, startSec: 0 },
      { word: 'world', charStart: 6, charEnd: 11, startSec: 0 },
    ]);
  });

  it('rebases char offsets when text is split across multiple text blocks', () => {
    // Full message text = "hello tools world" (split at 'hello ' and ' world')
    // Spans align to the full text:
    //   hello (0-5), tools (6-11), world (12-17)
    const a: TimelineBlock = { type: 'text', text: 'hello ', status: 'done' };
    const tool: TimelineBlock = {
      type: 'tool',
      toolUseId: 't1',
      toolName: 'x',
      input: {},
      status: 'done',
      startedAt: 0,
    };
    const b: TimelineBlock = { type: 'text', text: 'tools world', status: 'done' };

    const spans: WordSpan[] = [
      span('hello', 0, 5),
      span('tools', 6, 11),
      span('world', 12, 17),
    ];
    const result = computeTextBlockVoiceSlices([a, tool, b], spans);

    // First text block has 'hello' (global idx 0).
    expect(result.get(a)?.firstGlobalWordIdx).toBe(0);
    expect(result.get(a)?.localSpans).toEqual([
      { word: 'hello', charStart: 0, charEnd: 5, startSec: 0 },
    ]);

    // Second text block carries 'tools' (global idx 1) and 'world' (idx 2).
    // Its char offset within its OWN text starts at 0, so the spans get
    // re-based by -6 (the length of 'hello ').
    expect(result.get(b)?.firstGlobalWordIdx).toBe(1);
    expect(result.get(b)?.localSpans).toEqual([
      { word: 'tools', charStart: 0, charEnd: 5, startSec: 0 },
      { word: 'world', charStart: 6, charEnd: 11, startSec: 0 },
    ]);
  });

  it('skips non-text blocks without disturbing the char offset cursor', () => {
    const a: TimelineBlock = { type: 'text', text: 'hi', status: 'done' };
    const thinking: TimelineBlock = {
      type: 'thinking',
      blockIndex: 0,
      text: 'reasoning…',
      status: 'done',
    };
    const b: TimelineBlock = { type: 'text', text: 'world', status: 'done' };

    // Full assistant text = "hi" + "world" = "hiworld" (the thinking block's
    // text is reasoning content, not part of TTS — so spans must NOT include it).
    const spans: WordSpan[] = [span('hi', 0, 2), span('world', 2, 7)];
    const result = computeTextBlockVoiceSlices([a, thinking, b], spans);

    expect(result.get(a)?.firstGlobalWordIdx).toBe(0);
    expect(result.get(a)?.localSpans).toEqual([
      { word: 'hi', charStart: 0, charEnd: 2, startSec: 0 },
    ]);
    expect(result.get(b)?.firstGlobalWordIdx).toBe(1);
    expect(result.get(b)?.localSpans).toEqual([
      { word: 'world', charStart: 0, charEnd: 5, startSec: 0 },
    ]);
  });

  it('produces an empty-spans entry when a text block sits BEFORE the first span', () => {
    // Hypothetical: leading-whitespace block produces no span (rare but
    // possible if the LLM emits a punctuation-only first text_delta).
    const a: TimelineBlock = { type: 'text', text: '. ', status: 'done' };
    const b: TimelineBlock = { type: 'text', text: 'hello', status: 'done' };
    const spans: WordSpan[] = [span('hello', 2, 7)];
    const result = computeTextBlockVoiceSlices([a, b], spans);

    expect(result.get(a)).toEqual({ localSpans: [], firstGlobalWordIdx: -1 });
    expect(result.get(b)?.firstGlobalWordIdx).toBe(0);
  });
});

describe('localSpokenWordIndex', () => {
  it('returns -1 when the slice has no spans', () => {
    expect(
      localSpokenWordIndex({ localSpans: [], firstGlobalWordIdx: -1 }, 0),
    ).toBe(-1);
  });

  it('returns -1 when TTS has not reached the slice yet', () => {
    expect(
      localSpokenWordIndex(
        { localSpans: [span('a', 0, 1), span('b', 2, 3)], firstGlobalWordIdx: 5 },
        3,
      ),
    ).toBe(-1);
  });

  it('returns the local word index when TTS is mid-slice', () => {
    expect(
      localSpokenWordIndex(
        {
          localSpans: [span('a', 0, 1), span('b', 2, 3), span('c', 4, 5)],
          firstGlobalWordIdx: 2,
        },
        3, // global word 3 → local word 1
      ),
    ).toBe(1);
  });

  it('clamps to the last local index once TTS has passed the slice', () => {
    expect(
      localSpokenWordIndex(
        {
          localSpans: [span('a', 0, 1), span('b', 2, 3)],
          firstGlobalWordIdx: 0,
        },
        99, // way past the end of this slice
      ),
    ).toBe(1);
  });
});
