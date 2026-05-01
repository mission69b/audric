'use client';

import type { TextTimelineBlock } from '@/lib/engine-types';
import { AgentMarkdown } from '@/components/dashboard/AgentMarkdown';
import { ThinkingState } from '../ThinkingState';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — TextBlockView (B2.2)
//
// Renders the assistant's final text run. Mirrors the styling from the
// existing ChatMessage `hasContent` block (✦ leading mark + leading-relaxed
// text). When streaming, shows the trailing delivery indicator.
//
// Voice playback (VoiceHighlightedText) is intentionally NOT wired in B2.2
// — voice mode reads the message-level `content` field today, not per-block
// timeline state. Re-wiring voice to the timeline lands in B3 alongside
// the legacy-render fallback work.
// ───────────────────────────────────────────────────────────────────────────

interface TextBlockViewProps {
  block: TextTimelineBlock;
}

export function TextBlockView({ block }: TextBlockViewProps) {
  if (!block.text) return null;

  return (
    <div
      className="pl-1 text-sm"
      aria-live={block.status === 'streaming' ? 'polite' : 'off'}
      aria-atomic="false"
    >
      <span
        className="text-success-solid mr-1.5 float-left mt-0.5 text-[12px]"
        aria-hidden="true"
      >
        ✦
      </span>
      <div className="text-fg-primary leading-relaxed overflow-hidden">
        {block.status === 'streaming' ? (
          // [B2.3 mobile] break-words matches AgentMarkdown's post-stream
          // behavior — without it, long unbroken tokens (coin types, addresses)
          // overflow the narrow chat column on mobile during streaming.
          <span className="whitespace-pre-wrap break-words">
            {block.text}
            <span className="inline-flex items-center ml-1.5 align-text-bottom">
              <ThinkingState status="delivering" intensity="transitioning" />
            </span>
          </span>
        ) : (
          <AgentMarkdown text={block.text} />
        )}
      </div>
      {block.status === 'streaming' && (
        <span className="sr-only">Audric is typing</span>
      )}
    </div>
  );
}
