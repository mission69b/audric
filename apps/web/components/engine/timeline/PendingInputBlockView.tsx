'use client';

import type { PendingInputTimelineBlock } from '@/lib/engine-types';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — PendingInputBlockView (B2.2)
//
// Reserved render slot for SPEC 9 v0.1.2's inline-form primitive. The
// engine doesn't emit `pending_input` events under SPEC 8, so this
// component renders nothing under normal operation. The placeholder
// exists so:
//   1. The TimelineBlock discriminated union stays exhaustive (BlockRouter
//      compiles cleanly without a default case).
//   2. SPEC 9 has a mounted target to fill in.
//
// If a `pending-input` block ever appears in the timeline before SPEC 9
// ships, we render a quiet diagnostic so the bug is visible to the
// founder without crashing the page.
// ───────────────────────────────────────────────────────────────────────────

interface PendingInputBlockViewProps {
  block: PendingInputTimelineBlock;
}

export function PendingInputBlockView({ block }: PendingInputBlockViewProps) {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[ReasoningTimeline] pending-input block received before SPEC 9 ships:',
      block,
    );
  }
  return null;
}
