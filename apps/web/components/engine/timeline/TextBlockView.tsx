'use client';

import type { TextTimelineBlock } from '@/lib/engine-types';
import { AgentMarkdown } from '@/components/dashboard/AgentMarkdown';
import { ThinkingState } from '../ThinkingState';
import { VoiceHighlightedText } from '@/components/dashboard/VoiceHighlightedText';
import { AudricLine } from './primitives/AudricLine';
import {
  localSpokenWordIndex,
  type TextBlockVoiceSlice,
} from '@/lib/voice/timeline-voice-slices';
import { stripEvalSummaryMarker, stripThinkingTags } from '@/lib/sanitize-text';

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
  const displayText = stripThinkingTags(stripEvalSummaryMarker(block.text));
  if (!displayText) return null;

  const isActiveVoice =
    voiceSlice !== undefined &&
    spokenWordIndex !== undefined &&
    block.status !== 'streaming';

  return (
    <AudricLine ariaLive={block.status === 'streaming' ? 'polite' : 'off'}>
      {block.status === 'streaming' ? (
        // [B2.3 mobile] break-words matches AgentMarkdown's post-stream
        // behavior — without it, long unbroken tokens (coin types, addresses)
        // overflow the narrow chat column on mobile during streaming.
        <span className="whitespace-pre-wrap break-words">
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
        <AgentMarkdown text={displayText} />
      )}
    </AudricLine>
  );
}
