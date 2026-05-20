"use client";

/**
 * ChatDivider — narrow eyebrow separator that visually delineates
 * the start of each user-initiated turn.
 *
 * Ported from `apps/web/components/engine/ChatDivider.tsx` (S.204+
 * Phase 6.7). Renders a thin horizontal line with a mono-uppercase
 * label centered ("TASK INITIATED" by default).
 *
 * Placement in v2: inserted before each user message in the
 * `<Conversation>` timeline. The first user message kicks off the
 * conversation so we render it there; subsequent user messages get
 * one too so multi-turn sessions stay scannable.
 */

interface ChatDividerProps {
  label?: string;
}

export function ChatDivider({ label = "TASK INITIATED" }: ChatDividerProps) {
  return (
    // Purely decorative visual divider — the chat flow itself
    // semantically separates turns (a new <Message> block IS the
    // separator from an a11y standpoint). `aria-hidden` lets us keep
    // the visual landmark without polluting the assistive-tech tree.
    <div aria-hidden="true" className="flex items-center gap-3 py-3">
      <div className="h-px flex-1 bg-border-subtle" />
      <span className="shrink-0 font-mono text-[9px] text-fg-muted uppercase tracking-[0.12em]">
        {label}
      </span>
      <div className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}
