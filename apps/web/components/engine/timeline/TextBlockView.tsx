'use client';

import { stripProactiveMarkers } from '@/lib/proactive-marker';
import type { TextTimelineBlock } from '@/lib/engine-types';
import { AgentMarkdown } from '@/components/dashboard/AgentMarkdown';
import { ThinkingState } from '../ThinkingState';
import { VoiceHighlightedText } from '@/components/dashboard/VoiceHighlightedText';
import { AudricLine } from './primitives/AudricLine';
import {
  localSpokenWordIndex,
  type TextBlockVoiceSlice,
} from '@/lib/voice/timeline-voice-slices';
import { stripEvalSummaryMarker, stripThinkingTags, shortenRawTxHashes } from '@/lib/sanitize-text';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — TextBlockView (B2.2 + B3.4 + B3.5)
//
// Renders the assistant's final text run. The outer ✦ + leading-relaxed
// shell is owned by the `<AudricLine>` v2 primitive (B3.5 / Gap C); this
// view picks the inner content branch — streaming, voice-highlighted,
// or terminal markdown.
//
// [B3.4 / Gap F] Voice mode — when this message is the one currently
// being spoken via TTS, `voiceSlice` carries the per-block char/word
// alignment so we can render `<VoiceHighlightedText>` instead of
// `<AgentMarkdown>` (markdown is dropped during playback; the parent
// switches back once TTS ends). The slice is computed by the parent
// `<ReasoningTimeline>` once per message (preserves char offsets across
// multiple text blocks interleaved with tool calls).
//
// [SPEC 9 v0.1.1 P9.2] When `block.proactive` is set with `suppressed:
// false`, the LLM emitted a `<proactive type="..." subjectKey="...">…
// </proactive>` wrapper around its response — render with the
// `✦ ADDED BY AUDRIC` lockup badge above the text + a dim left border
// + italic body so the user recognises this as an unsolicited insight,
// not a direct answer to a question. When `suppressed: true`
// (per-session cooldown hit), the wrapper is silently stripped and we
// render the body as a regular text block — narrative still flows, the
// lockup just doesn't fire twice.
// ───────────────────────────────────────────────────────────────────────────

interface TextBlockViewProps {
  block: TextTimelineBlock;
  /**
   * [B3.4] Voice-mode props for THIS specific text block. When provided
   * (TTS is speaking AND this is the active message), the renderer
   * swaps the markdown branch for the word-highlight branch. Undefined
   * during streaming and on every non-active assistant message.
   */
  voiceSlice?: TextBlockVoiceSlice;
  /**
   * [B3.4] The CURRENT global `spokenWordIndex` from
   * `useVoiceModeContext`. Re-based via `localSpokenWordIndex(slice, …)`
   * so `<VoiceHighlightedText>` can compare local indices to a local
   * progress marker.
   */
  spokenWordIndex?: number;
}

export function TextBlockView({ block, voiceSlice, spokenWordIndex }: TextBlockViewProps) {
  // [SPEC 8 v0.5.2 hotfix · G1 leak] Strip any `<eval_summary>...</eval_summary>`
  // markers that the model leaks into final assistant text (the engine already
  // parses + suppresses the marker in thinking content; the leak is a separate
  // model-compliance issue). See lib/sanitize-text.ts for the full rationale.
  // [SPEC 7 P2.8 follow-up · Bug C] Also strip `<thinking>...</thinking>` tags
  // that Sonnet occasionally mimics in text output (its real reasoning already
  // flows through the extended thinking channel and renders as THOUGHT blocks).
  // [SPEC 9 v0.1.1 P9.2] Also strip `<proactive>` markers — during streaming,
  // the wrapper chars arrive in `text` BEFORE the engine emits the
  // `proactive_text` event that finalises the block, so we strip pre-emptively
  // here for cleaner streaming UX. After turn_complete the timeline-builder
  // has already stripped them; calling stripProactiveMarkers a second time is
  // a no-op (idempotent).
  // [SPEC 21.2 D-4a / 2026-05-10] Defense-in-depth: shorten raw base58
  // tx hashes in prose. The system prompt forbids the LLM from emitting
  // bare digests (the receipt card carries the explorer link), but if
  // it slips through we shorten "5cFhP9TjqZxGfV...long base58..." to a
  // recognisable "5cFhP9…N1aB" preview. URLs and markdown link labels
  // are preserved (negative lookarounds in the regex). See
  // `shortenRawTxHashes` JSDoc in `sanitize-text.ts` for the full rule.
  const displayText = shortenRawTxHashes(
    stripProactiveMarkers(stripThinkingTags(stripEvalSummaryMarker(block.text))),
  );
  if (!displayText) return null;

  const isActiveVoice =
    voiceSlice !== undefined &&
    spokenWordIndex !== undefined &&
    block.status !== 'streaming';

  // Proactive lockup activates only when (a) marker was found and (b)
  // cooldown didn't suppress this emission. Suppressed proactive blocks
  // render as regular text — narrative flows, no visual treatment.
  const isProactive = block.proactive !== undefined && block.proactive.suppressed === false;

  const audricLine = (
    <AudricLine ariaLive={block.status === 'streaming' ? 'polite' : 'off'}>
      {block.status === 'streaming' ? (
        // [B2.3 mobile] break-words matches AgentMarkdown's post-stream
        // behavior — without it, long unbroken tokens (coin types, addresses)
        // overflow the narrow chat column on mobile during streaming.
        <span className={`whitespace-pre-wrap break-words ${isProactive ? 'italic' : ''}`}>
          {displayText}
          <span className="inline-flex items-center ml-1.5 align-text-bottom">
            <ThinkingState status="delivering" intensity="transitioning" />
          </span>
          <span className="sr-only">Audric is typing</span>
        </span>
      ) : isActiveVoice ? (
        <VoiceHighlightedText
          text={displayText}
          spans={voiceSlice!.localSpans}
          spokenWordIndex={localSpokenWordIndex(voiceSlice!, spokenWordIndex!)}
        />
      ) : (
        <div className={isProactive ? 'italic' : ''}>
          <AgentMarkdown text={displayText} />
        </div>
      )}
    </AudricLine>
  );

  if (!isProactive) return audricLine;

  // Lockup envelope — small "✦ ADDED BY AUDRIC" badge above the body,
  // dim border-left accent so the eye registers it as a distinct row.
  return (
    <div className="border-l-2 border-info-solid/30 pl-3 py-1">
      <div
        className="font-mono text-[10px] uppercase tracking-[0.1em] text-info-solid mb-1"
        aria-label="proactive insight"
      >
        ✦ ADDED BY AUDRIC
      </div>
      {audricLine}
    </div>
  );
}
