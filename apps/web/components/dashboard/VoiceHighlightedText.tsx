'use client';

import { Fragment, useMemo } from 'react';
import type { WordSpan } from '@/lib/voice/word-alignment';

/**
 * Render an assistant message with Claude-style two-tone word highlight
 * driven by TTS playback progress. Words at index <= `spokenWordIndex`
 * render in primary color; future words render dimmed.
 *
 * We render the original text verbatim and slice it into segments using
 * the WordSpan offsets returned by ElevenLabs. This guarantees punctuation,
 * whitespace, and word boundaries match exactly what the audio is speaking
 * — no off-by-one drift between visual highlight and audible playback.
 *
 * Markdown formatting is intentionally dropped while voice mode is active.
 * The spoken state is transient (a few seconds at most) and trying to
 * preserve markdown would require re-walking the AST every time
 * `spokenWordIndex` changes (60×/sec via rAF). Once TTS ends, the parent
 * component switches back to <AgentMarkdown>.
 */

interface VoiceHighlightedTextProps {
  text: string;
  spans: WordSpan[];
  spokenWordIndex: number;
}

export function VoiceHighlightedText({
  text,
  spans,
  spokenWordIndex,
}: VoiceHighlightedTextProps) {
  // Build the render plan once per (text, spans) tuple. Highlight color
  // is then a cheap conditional during render rather than a re-walk.
  const segments = useMemo(() => {
    if (spans.length === 0) {
      return [{ text, isWord: false, wordIndex: -1 }];
    }
    const out: { text: string; isWord: boolean; wordIndex: number }[] = [];
    let cursor = 0;
    spans.forEach((span, idx) => {
      if (span.charStart > cursor) {
        out.push({
          text: text.slice(cursor, span.charStart),
          isWord: false,
          wordIndex: -1,
        });
      }
      out.push({
        text: text.slice(span.charStart, span.charEnd),
        isWord: true,
        wordIndex: idx,
      });
      cursor = span.charEnd;
    });
    if (cursor < text.length) {
      out.push({ text: text.slice(cursor), isWord: false, wordIndex: -1 });
    }
    return out;
  }, [text, spans]);

  return (
    <span className="whitespace-pre-wrap leading-relaxed">
      {segments.map((seg, i) => {
        if (!seg.isWord) {
          return <Fragment key={i}>{seg.text}</Fragment>;
        }
        const spoken = seg.wordIndex <= spokenWordIndex;
        return (
          <span
            key={i}
            className={
              spoken
                ? 'text-fg-primary transition-colors duration-100'
                : 'text-fg-muted opacity-60 transition-colors duration-100'
            }
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}
