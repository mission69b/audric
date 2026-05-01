'use client';

import { useState } from 'react';
import type { ThinkingTimelineBlock, EvaluationItem } from '@/lib/engine-types';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ThinkingBlockView (B2.2 + B3.3)
//
// Two render modes selected by the engine via the `summaryMode` flag:
//
//   1. Default mode: italic "✦ audric is thinking" header + accumulating
//      text. Streaming = always expanded with a soft animation hint.
//      Done = collapsed by default, click to expand. Matches the v0.4
//      visual primitive (italic typeset, low-key tone).
//
//   2. summaryMode: the LLM emitted a parseable <eval_summary> marker
//      inside this block. We render the HowIEvaluated trust card
//      ("✦ HOW I EVALUATED THIS") with structured rows from
//      `evaluationItems` instead of the raw thinking text.
//
// Auto-expand semantics (SPEC 8 v0.5 G8 + B3.3):
//
//   - **Controlled mode** (used by `<ReasoningTimeline>`): parent owns
//     a `Map<blockIndex, 'expanded' | 'collapsed'>` and passes the
//     current value via `expanded` + a `onToggle` callback. This is
//     what gives us "auto-expand on first emission only, manual state
//     preserved on rehydrate" — the parent seeds the map from the
//     block's status the FIRST time it sees a blockIndex, and never
//     re-seeds on a streaming→done transition. User toggles persist
//     until the parent unmounts (whole-message scope).
//
//   - **Uncontrolled mode** (used by standalone tests + any future
//     consumer that doesn't lift state): falls back to a per-component
//     `useState(isStreaming)` — the pre-B3.3 behavior. Existing tests
//     keep working with no changes.
// ───────────────────────────────────────────────────────────────────────────

interface ThinkingBlockViewProps {
  block: ThinkingTimelineBlock;
  /**
   * [B3.3] Controlled-mode expansion state. When provided, `<ThinkingBlockView>`
   * does NOT manage its own `useState`; the parent owns it via a
   * `Map<blockIndex, ...>`. Pair with `onToggle` to make it interactive.
   */
  expanded?: boolean;
  /**
   * [B3.3] Click handler for the disclosure button. Required when
   * `expanded` is provided (controlled mode); ignored in uncontrolled
   * mode (the component manages its own state).
   */
  onToggle?: () => void;
}

const STATUS_DOT: Record<EvaluationItem['status'], string> = {
  good: 'text-success-solid',
  warning: 'text-warning-solid',
  critical: 'text-danger-solid',
  info: 'text-fg-muted',
};

const STATUS_GLYPH: Record<EvaluationItem['status'], string> = {
  good: '✓',
  warning: '⚠',
  critical: '✗',
  info: '·',
};

export function ThinkingBlockView({
  block,
  expanded: controlledExpanded,
  onToggle: controlledOnToggle,
}: ThinkingBlockViewProps) {
  const isStreaming = block.status === 'streaming';
  // Uncontrolled fallback: only used when the parent did not provide
  // `expanded`. Default is `isStreaming` — matches pre-B3.3 behavior so
  // every existing standalone consumer/test continues to work.
  const [uncontrolled, setUncontrolled] = useState(isStreaming);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : uncontrolled;
  const handleToggle = isControlled
    ? (controlledOnToggle ?? (() => {}))
    : () => setUncontrolled((v) => !v);

  if (block.summaryMode && block.evaluationItems && block.evaluationItems.length > 0) {
    return <HowIEvaluatedCard items={block.evaluationItems} />;
  }

  if (!block.text) return null;

  return (
    <div className="pl-1 mb-1.5">
      <button
        type="button"
        onClick={handleToggle}
        className="group flex items-center gap-1.5 py-1 text-fg-muted hover:text-fg-primary/60 transition-colors"
        aria-expanded={expanded}
      >
        <span
          className={cn(
            'inline-flex transition-transform duration-200',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        >
          <Icon name="chevron-right" size={10} />
        </span>
        <span className="font-mono text-[11px] tracking-wider uppercase">
          {isStreaming ? 'Reasoning…' : 'How I evaluated this'}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 ml-[18px] rounded-md border border-border-subtle bg-surface-card px-3 py-2.5">
          <p
            className={cn(
              'font-mono text-[12px] leading-[1.7] text-fg-secondary whitespace-pre-wrap break-words',
              isStreaming && 'italic',
            )}
          >
            {block.text}
          </p>
        </div>
      )}
    </div>
  );
}

interface HowIEvaluatedCardProps {
  items: EvaluationItem[];
}

function HowIEvaluatedCard({ items }: HowIEvaluatedCardProps) {
  return (
    <div className="pl-1 mb-2">
      <div className="rounded-md border border-border-subtle bg-surface-card px-3 py-2.5">
        <div className="flex items-center gap-1.5 pb-1.5 border-b border-border-subtle/50">
          <span className="text-success-solid text-[11px]" aria-hidden="true">✦</span>
          <span className="font-mono text-[11px] tracking-wider uppercase text-fg-muted">
            How I evaluated this
          </span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] leading-snug">
              <span
                className={cn('font-mono w-3 shrink-0 text-center', STATUS_DOT[item.status])}
                aria-label={item.status}
              >
                {STATUS_GLYPH[item.status]}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-fg-primary">{item.label}</span>
                {item.note && (
                  <span className="text-fg-secondary ml-2">{item.note}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
