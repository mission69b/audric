'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — ReasoningStream primitive (audit Gap C)
//
// Italic typeset reasoning surface with a soft caret at the streaming
// cursor. The reveal cursor snaps to `text.length` on initial mount so
// already-buffered text (rehydration / mid-stream re-render) doesn't
// re-type from zero. After mount, when `text` GROWS while the block is
// still streaming, the cursor walks forward at `charsPerTick` per
// `tickMs` — providing a calm "typewriter chasing the LLM stream"
// effect rather than the twitchy 1-char-at-a-time the LLM token cadence
// would otherwise produce.
//
// Once the block flips `streaming → false` (done / interrupted /
// rehydrate-mid-render), the cursor snaps to `text.length` in one
// frame and the caret disappears.
//
// The component is the inner content surface only — it does NOT render
// its own header / disclosure. `<ThinkingBlockView>` owns the header
// (via `<ThinkingHeader>`) and calls into this primitive once expanded.
// ───────────────────────────────────────────────────────────────────────────

interface ReasoningStreamProps {
  /** Full thinking text. Engine appends to this as deltas arrive; the
   *  primitive caches its reveal cursor and animates forward as `text`
   *  grows. */
  text: string;
  /** True while the block is `'streaming'`. False once the block hits
   *  `'done'` / `'error'` / `'interrupted'` (or on rehydrate). */
  streaming: boolean;
  /** Reveal stride — characters per tick. v2 demo locks 2 to keep the
   *  animation calm; exposed for future tuning. */
  charsPerTick?: number;
  /** Tick interval in ms. Defaults to 22ms — matches v2 demo's
   *  `useTyped(speed=22)`. */
  tickMs?: number;
}

export function ReasoningStream({
  text,
  streaming,
  charsPerTick = 2,
  tickMs = 22,
}: ReasoningStreamProps) {
  // Reveal cursor — character index up to which `text` is visible.
  // Initial state snaps to `text.length` so rehydrated / already-
  // buffered text shows immediately. Subsequent growth (text-deltas
  // arriving from the engine) animates forward via the effect below.
  const [revealed, setRevealed] = useState(text.length);

  useEffect(() => {
    if (!streaming) {
      setRevealed(text.length);
      return;
    }
    if (revealed >= text.length) return;
    const t = setTimeout(() => {
      setRevealed((r) => Math.min(r + charsPerTick, text.length));
    }, tickMs);
    return () => clearTimeout(t);
  }, [streaming, revealed, text, charsPerTick, tickMs]);

  // Re-clamp cursor when text shrinks (rare — only happens if a parent
  // resets the block; engine itself only appends).
  useEffect(() => {
    if (revealed > text.length) setRevealed(text.length);
  }, [text, revealed]);

  const showCursor = streaming && revealed < text.length;

  return (
    <div
      className="pl-[14px] pr-3 py-2 border-l-2 border-border-subtle ml-1.5 transition-colors"
      // Mirrors the v2 demo's "thin left rule, indent" aesthetic — the
      // border carries the visual weight rather than a card surface,
      // keeping the timeline's chronological rhythm intact.
    >
      <p
        className={cn(
          'font-mono text-[12px] leading-[1.65] text-fg-secondary whitespace-pre-wrap break-words',
          // Italic only while typing — once it lands, the type is calm.
          streaming && 'italic',
        )}
      >
        {text.slice(0, revealed)}
        {showCursor && (
          <span
            className="inline-block w-[2px] h-[1em] align-text-bottom bg-fg-muted animate-pulse ml-[1px]"
            aria-hidden="true"
          />
        )}
      </p>
    </div>
  );
}
