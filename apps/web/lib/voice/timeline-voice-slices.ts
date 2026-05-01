// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — Voice highlight slices per text block (audit Gap F)
//
// In the v2 timeline path, the assistant's text content is split across
// one or more `TextTimelineBlock`s (typically just one — but interleaved
// tool calls can cause multiple text blocks). Voice mode synthesises
// the FULL concatenated text and returns word spans relative to that
// full string. This helper localises those spans to each text block so
// `<TextBlockView>` can render `<VoiceHighlightedText>` with offsets
// that line up with the slice it actually displays.
//
// The legacy path doesn't need this — it renders `message.content` as
// one chunk and the spans align trivially.
// ───────────────────────────────────────────────────────────────────────────

import type { TimelineBlock } from '@/lib/engine-types';
import type { WordSpan } from '@/lib/voice/word-alignment';

export interface TextBlockVoiceSlice {
  /** Spans whose char ranges fall inside this block, re-based so
   *  `charStart`/`charEnd` index into the BLOCK's text (not the full
   *  message text). */
  localSpans: WordSpan[];
  /** The global word index of the first span in this block (or -1 if
   *  the block has no spans). Used to re-base `spokenWordIndex` so
   *  `<VoiceHighlightedText>` can compare local indices against a
   *  local progress marker. */
  firstGlobalWordIdx: number;
}

/**
 * Compute one slice per text block, keyed by block reference. Non-text
 * blocks are skipped. Keying by reference rather than array index keeps
 * lookups O(1) regardless of how `<ReasoningTimeline>` re-orders /
 * groups blocks for rendering.
 *
 * Order matters during the walk: blocks are processed in array order so
 * cumulative char offsets line up with the way `text_delta` events were
 * appended in `applyEventToTimeline`.
 */
export function computeTextBlockVoiceSlices(
  blocks: TimelineBlock[],
  spans: WordSpan[],
): Map<TimelineBlock, TextBlockVoiceSlice> {
  const result = new Map<TimelineBlock, TextBlockVoiceSlice>();
  if (spans.length === 0) return result;

  let charOffset = 0;

  for (const block of blocks) {
    if (block.type !== 'text') continue;

    const blockStart = charOffset;
    const blockEnd = blockStart + block.text.length;

    const localSpans: WordSpan[] = [];
    let firstGlobalWordIdx = -1;

    for (let j = 0; j < spans.length; j++) {
      const s = spans[j];
      // A span "belongs" to this block when its start lies inside the
      // block's char range. We don't need a strict charEnd <= blockEnd
      // check — text-deltas append cleanly, so a span that starts in
      // block N never extends into block N+1.
      if (s.charStart >= blockStart && s.charStart < blockEnd) {
        if (firstGlobalWordIdx === -1) firstGlobalWordIdx = j;
        localSpans.push({
          ...s,
          charStart: s.charStart - blockStart,
          charEnd: s.charEnd - blockStart,
        });
      }
    }

    result.set(block, { localSpans, firstGlobalWordIdx });
    charOffset = blockEnd;
  }

  return result;
}

/**
 * Convert a global `spokenWordIndex` into a slice-local one.
 *  - Returns -1 when TTS hasn't yet reached this block (all words dimmed).
 *  - Returns localSpans.length-1 when TTS has already passed this block
 *    (all words highlighted).
 *  - Otherwise returns the local idx that corresponds to the global one.
 */
export function localSpokenWordIndex(
  slice: TextBlockVoiceSlice,
  globalSpokenWordIndex: number,
): number {
  if (slice.firstGlobalWordIdx === -1 || slice.localSpans.length === 0) {
    return -1;
  }
  if (globalSpokenWordIndex < slice.firstGlobalWordIdx) return -1;
  // Advance is at most localSpans.length-1 — once TTS has finished this
  // block, every local word is highlighted.
  const local = globalSpokenWordIndex - slice.firstGlobalWordIdx;
  return local >= slice.localSpans.length ? slice.localSpans.length - 1 : local;
}
