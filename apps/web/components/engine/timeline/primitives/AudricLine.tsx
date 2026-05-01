'use client';

import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — AudricLine primitive (audit Gap C)
//
// One assistant text line, prefixed with the green ✦ sparkle and
// rendered at the canonical leading + size used across the timeline.
// Used as the wrapper for `<TextBlockView>` so the v2 visual identity
// (✦ + leading-relaxed + dimmed-secondary tone) shows up without each
// caller having to repeat the markup.
//
// `<TextBlockView>` already inlined this shape pre-B3.5; the primitive
// extracts it so future consumers (canvas headers, post-write summary
// cards) get the same look automatically.
// ───────────────────────────────────────────────────────────────────────────

interface AudricLineProps {
  children: ReactNode;
  /** ARIA-live region role — text blocks set 'polite' while streaming. */
  ariaLive?: 'off' | 'polite' | 'assertive';
  /** Optional className extension for callers that need extra layout
   *  (e.g. the streaming text branch which adds `break-words`). */
  className?: string;
}

export function AudricLine({ children, ariaLive = 'off', className }: AudricLineProps) {
  return (
    <div
      className={cn('pl-1 text-sm flex gap-2 items-start', className)}
      aria-live={ariaLive}
      aria-atomic="false"
    >
      <span
        className="text-success-solid mt-[3px] text-[12px] shrink-0"
        aria-hidden="true"
      >
        ✦
      </span>
      <div className="flex-1 min-w-0 text-fg-primary leading-relaxed overflow-hidden">
        {children}
      </div>
    </div>
  );
}
