'use client';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — ThinkingHeader primitive (audit Gap C)
//
// Audric "A" badge that pulses while the LLM is mid-think, swapping to
// a green check once the block lands its `thinking_done`. Mirrors the
// `audric_demos_v2/shared/primitives.jsx` `ThinkingHeader` shape but
// uses the audric/web Tailwind tokens (--surface-inverse / --success-
// solid / --fg-muted) instead of CSS vars. Visual contract:
//
//   ┌─────┐
//   │  A  │  THINKING…   (avatar pulses; mono label uses opacity wave)
//   └─────┘
//
//   ┌─────┐
//   │  ✓  │  THOUGHT     (avatar flips to green-bg + check; label calms)
//   └─────┘
// ───────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/cn';

interface ThinkingHeaderProps {
  /** Set to `true` once the block transitioned out of `streaming` / into
   *  `done` or `interrupted`. Switches the avatar from pulsing-A to
   *  green-check and the label from "THINKING…" to "THOUGHT". */
  done: boolean;
  /** Optional override (the only consumer today is `<ThinkingBlockView>`
   *  which uses the default; reserved for SPEC 9 mid-flight narrations
   *  that want a custom label like "EVALUATING…"). */
  label?: string;
  /** Click handler — when set, the whole header becomes the disclosure
   *  control for the underlying reasoning content. Mirrors the existing
   *  `<ThinkingBlockView>` button surface. */
  onClick?: () => void;
  /** ARIA expanded state for the disclosure surface. */
  expanded?: boolean;
}

export function ThinkingHeader({
  done,
  label,
  onClick,
  expanded,
}: ThinkingHeaderProps) {
  const resolvedLabel = label ?? (done ? 'THOUGHT' : 'THINKING…');

  const inner = (
    <span className="inline-flex items-center gap-2">
      {done ? (
        <span
          className="w-4 h-4 rounded-full bg-success-solid grid place-items-center shrink-0"
          aria-hidden="true"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4 7L8 3"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <span
          className="w-4 h-4 rounded-full bg-bubble-user-bg grid place-items-center shrink-0 text-bubble-user-fg text-[8px] font-medium animate-pulse"
          style={{
            // Use the brand serif so the avatar reads as "Audric A" — same
            // family the topbar logo + Passport intro use.
            fontFamily: 'var(--font-serif), serif',
            lineHeight: 1,
            letterSpacing: 0,
          }}
          aria-hidden="true"
        >
          A
        </span>
      )}
      <span
        className={cn(
          'font-mono text-[10px] tracking-[0.14em] uppercase',
          done ? 'text-fg-secondary' : 'text-fg-muted animate-pulse',
        )}
      >
        {resolvedLabel}
      </span>
    </span>
  );

  if (!onClick) {
    return (
      <div className="flex items-center gap-1.5 py-1" role="status" aria-label={resolvedLabel}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="group flex items-center gap-1.5 py-1 hover:opacity-80 transition-opacity"
    >
      {inner}
    </button>
  );
}
