'use client';

import type { RegeneratedTimelineBlock } from '@/lib/engine-types';
import { ToolBlockView } from './ToolBlockView';
import { formatDurationMs } from '@/lib/format-quote-age';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.4b — RegeneratedBlockView
//
// "↻ Regenerated · 1.4s" labeled group rendered above the fresh
// PermissionCard whose payload landed in the same regenerate response.
// Each child is a regular `ToolTimelineBlock` for one re-fired upstream
// read — we delegate rendering to the existing `ToolBlockView` so each
// gets its rich result card (BalCard, RatesCard, etc.) verbatim. Goal
// is "feels like the engine just streamed these reads live."
//
// Visual: a thin labeled wrapper (matches SPEC 8 v0.4 group-block
// aesthetics — no heavy chrome, just a top label + indented children).
// ───────────────────────────────────────────────────────────────────────────

interface RegeneratedBlockViewProps {
  block: RegeneratedTimelineBlock;
}

export function RegeneratedBlockView({ block }: RegeneratedBlockViewProps) {
  const label = `↻ Regenerated · ${formatDurationMs(block.durationMs)}`;
  return (
    <div
      className="space-y-1.5"
      role="group"
      aria-label={label}
    >
      <div className="text-[10px] font-mono uppercase tracking-wide text-fg-secondary">
        {label}
      </div>
      <div className="ml-3 space-y-1.5 border-l border-border-subtle pl-3">
        {block.toolBlocks.map((toolBlock) => (
          <ToolBlockView key={toolBlock.toolUseId} block={toolBlock} />
        ))}
      </div>
    </div>
  );
}
