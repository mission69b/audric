'use client';

import type { PlanStreamTimelineBlock } from '@/lib/engine-types';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.5b Layer 5 — PlanStreamBlockView
//
// Renders a single "PLAN STREAM · N OPS" planning row that always
// appears as the FINAL row before a multi-step Payment Stream
// `permission-card` block. Marks "the agent finished evaluating and
// compiled this into one atomic PTB". Single-write confirms never get
// this row — `applyEventToTimeline` only injects it when the action's
// `steps.length >= 2`.
//
// Visual: matches the Cursor-style mono label rows used elsewhere in
// the timeline. No animations / no running-spinner — by the time the
// engine yields `pending_action`, the planning IS the bundle, so the
// row reads as a static separator.
// ───────────────────────────────────────────────────────────────────────────

interface PlanStreamBlockViewProps {
  block: PlanStreamTimelineBlock;
}

export function PlanStreamBlockView({ block }: PlanStreamBlockViewProps) {
  const opsLabel = `${block.stepCount} ${block.stepCount === 1 ? 'op' : 'ops'}`;
  return (
    <div
      className="flex items-baseline gap-2 text-[10px] font-mono uppercase tracking-wide text-fg-secondary"
      role="status"
      aria-label={`Plan stream compiled with ${block.stepCount} operations`}
    >
      <span className="text-fg-tertiary">PLAN STREAM</span>
      <span aria-hidden="true">·</span>
      <span className="text-fg-secondary">{opsLabel}</span>
      <span aria-hidden="true">·</span>
      <span className="text-fg-tertiary">ATOMIC</span>
    </div>
  );
}
