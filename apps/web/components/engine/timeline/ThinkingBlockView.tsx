'use client';

import { useState } from 'react';
import type { ThinkingTimelineBlock, EvaluationItem } from '@/lib/engine-types';
import { cn } from '@/lib/cn';
import { ThinkingHeader } from './primitives/ThinkingHeader';
import { ReasoningStream } from './primitives/ReasoningStream';
import { HowIEvaluated } from './primitives/HowIEvaluated';
import { stripEvalSummaryMarker } from '@/lib/sanitize-text';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ThinkingBlockView (B2.2 + B3.3 + B3.5)
//
// Two render modes selected by the engine via the `summaryMode` flag:
//
//   1. Default mode: `<ThinkingHeader>` (pulsing Audric "A" → green
//      check) + `<ReasoningStream>` (typed-italic 2-3 chars/tick reveal
//      while streaming, snap-to-final on done) when expanded. B3.5
//      ports both halves to the v2 visual primitives (audit Gap C).
//      Streaming = auto-expanded by parent. Done = collapsed by default,
//      click to expand.
//
//   2. summaryMode: the LLM emitted a parseable <eval_summary> marker
//      inside this block. `<HowIEvaluated>` renders the disclosure with
//      a token/model/latency badge (B3.5) and the existing
//      `<HowIEvaluatedItems>` ul as its body.
//
// Auto-expand semantics (SPEC 8 v0.5 G8 + B3.3): unchanged from B3.3.
// Controlled mode owns expansion via a `Map<blockIndex, expanded>` in
// `<ReasoningTimeline>`. Uncontrolled mode falls back to a per-component
// `useState(isStreaming)` so standalone tests + future consumers stay
// byte-compatible.
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
  /**
   * [SPEC 21.3] Render-time similarity collapse. When the parent
   * (`<ReasoningTimeline>` via `<BlockRouter>`) has determined that this
   * thinking block's content is ≈ identical to a recent prior turn's
   * thinking (Jaccard > threshold + matching 3-token prefix), it passes
   * `{ collapse: true, similarTurnIndex }` so we render a single-line
   * `THINKING — same as turn N (click to expand)` row instead of the
   * full reasoning stream. Click-to-expand restores the full view via
   * the same `expanded` / `onToggle` controlled-mode pair.
   *
   * Undefined → render normally (no similarity check applied).
   * `{ collapse: false }` → also renders normally; included so the
   * compute helper can return a single shape.
   *
   * The actual collapse decision lives in `lib/thinking-similarity.ts`
   * (`computeThinkingCollapse`). Carve-outs (first turn, error
   * recovery, ambiguous input, multi-step planning) are applied there.
   */
  collapseInfo?: { collapse: boolean; similarTurnIndex?: number };
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
  collapseInfo,
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

  // [SPEC 8 v0.5.2 hotfix · G1 streaming flash] Strip `<eval_summary>...`
  // markers from the raw thinking text WHILE streaming. The engine's
  // anthropic provider parses the marker on thinking_done and flips
  // summaryMode → true, at which point the trust card replaces this
  // entire branch (the early return above). Until thinking_done fires,
  // the raw marker text leaks into the accordion as it streams in.
  // stripEvalSummaryMarker handles partial markers (truncates from the
  // open tag onward when no closing tag exists yet), so the user sees
  // clean prose right up to the moment the trust card swaps in.
  const displayText = stripEvalSummaryMarker(block.text);
  if (!displayText) return null;

  // [SPEC 21.3] Similarity collapse. The collapsed view is a single
  // disclosure-button row that swaps in for the entire ThinkingHeader +
  // ReasoningStream pair. It honors the `expanded` controlled-mode prop
  // — click to restore the full view (the underlying text is preserved,
  // just hidden behind the collapsed label). When NOT expanded AND
  // `collapseInfo.collapse === true`, we render the compact row. Streaming
  // blocks are NEVER collapsed (the user is watching reasoning happen
  // live; collapsing mid-stream would break the reveal animation).
  const shouldCollapse =
    collapseInfo?.collapse === true && !isStreaming && !expanded;

  if (shouldCollapse) {
    const turnLabel = collapseInfo!.similarTurnIndex
      ? `same as turn ${collapseInfo!.similarTurnIndex}`
      : 'same as a recent turn';
    return (
      <div className="pl-1 mb-1.5">
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase text-fg-muted hover:text-fg-secondary transition-colors"
          data-testid="thinking-collapsed"
          data-similar-turn={collapseInfo!.similarTurnIndex ?? ''}
          aria-label={`Thinking — ${turnLabel}, click to expand`}
        >
          <span aria-hidden="true">▸</span>
          <span>THINKING — {turnLabel} (click to expand)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pl-1 mb-1.5">
      <ThinkingHeader done={!isStreaming} onClick={handleToggle} expanded={expanded} />
      {expanded && (
        <div className="mt-0.5">
          <ReasoningStream text={displayText} streaming={isStreaming} />
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
    <HowIEvaluated>
      <ul className="space-y-1.5">
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
    </HowIEvaluated>
  );
}
