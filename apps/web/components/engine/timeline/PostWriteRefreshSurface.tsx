'use client';

import type { ToolTimelineBlock } from '@/lib/engine-types';
import { getStepIcon, getStepLabel } from '../AgentStep';
import { ToolBlockView } from './ToolBlockView';
import {
  ParallelToolsRow,
  type ParallelRowStatus,
} from './primitives/ParallelToolsRow';
import { getResultPreview } from './result-preview';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23A-A6 — PostWriteRefreshSurface (2026-05-11)
//
// Wraps consecutive tool blocks all carrying `source === 'pwr'` (engine
// 1.28+ stamps these on the balance + savings reads it injects AFTER a
// confirm-tier write resolves, so the next narration sees fresh state).
//
// Pre-A6 these reads stacked as standalone tool cards under the receipt,
// reading as "5 more random tool calls" instead of "the system catching
// up with the change you just made". The surface frames them as a single
// post-approval consequence:
//
//   ↻ AFTER YOUR APPROVAL · REFRESHING STATE              2/2 done
//   ┌──────────────────────────────────────────────────┐
//   │ 💰  BALANCE CHECK     $1,985 total · earning $11   ●  DONE │
//   │ 💎  SAVINGS INFO      $2,000 saved · 6.4% APY      ●  DONE │
//   └──────────────────────────────────────────────────┘
//
// Visual + interaction parity with `<ParallelToolsGroup>` — same row
// primitive, same per-tool result preview, same headerless cards under
// the cluster. The only deltas are:
//   - Glyph: ↻ (refresh) instead of ⊞ (parallel)
//   - Header copy: "AFTER YOUR APPROVAL · REFRESHING STATE"
//   - Always renders the surface, even at length 1 (the framing IS the
//     point — a one-read refresh still signals "this happened because
//     of the write you just approved").
//
// The grouping decision lives in `lib/timeline-groups.ts` — this
// component renders whatever runs that decision emits. Backward
// compat: older engines (< 1.28) omit `source`, the timeline-groups
// rule never fires `pwr-group`, and these reads keep stacking as
// standalone tool blocks. No regression for in-flight legacy turns.
// ───────────────────────────────────────────────────────────────────────────

interface PostWriteRefreshSurfaceProps {
  tools: ToolTimelineBlock[];
  /** Same isStreaming gate as ToolBlockView — hide cards while the
   *  message is still streaming so we don't pop in half-results. */
  isStreaming?: boolean;
}

function toRowStatus(s: ToolTimelineBlock['status']): ParallelRowStatus {
  switch (s) {
    case 'streaming':
    case 'running':
      return 'running';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'interrupted':
      return 'interrupted';
  }
}

/** Mirrors ParallelToolsGroup.rowSub — see SPEC 23A-A1 for the per-tool
 *  preview registry contract. Kept as a local copy so future PWR-specific
 *  sub-line tweaks (e.g. "before: $X · after: $Y" diffs in a follow-up)
 *  don't have to fork the parallel-group helper. */
function rowSub(tool: ToolTimelineBlock): string {
  if (tool.status === 'streaming' || tool.status === 'running') {
    return tool.progress?.message ?? 'refreshing…';
  }
  if (tool.status === 'interrupted') return 'interrupted';
  if (tool.status === 'error') return 'failed';
  const preview = getResultPreview(tool.toolName, tool.result);
  if (preview) return preview;
  if (tool.startedAt !== undefined && tool.endedAt !== undefined) {
    const seconds = Math.max(0, (tool.endedAt - tool.startedAt) / 1000);
    return `refreshed in ${seconds.toFixed(1)}s`;
  }
  return 'refreshed';
}

export function PostWriteRefreshSurface({
  tools,
  isStreaming,
}: PostWriteRefreshSurfaceProps) {
  if (tools.length === 0) return null;

  const doneCount = tools.filter(
    (t) => t.status === 'done' || t.status === 'error' || t.status === 'interrupted',
  ).length;
  const total = tools.length;
  const allDone = doneCount === total;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mt-1.5 mb-1">
        <span className="text-[12px] text-fg-muted" aria-hidden="true">
          ↻
        </span>
        {/* SPEC 23A-A7 — letter-spacing matches `<ParallelToolsGroup>`
            header (0.12em) so the two surfaces read as one family. */}
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-secondary">
          AFTER YOUR APPROVAL · REFRESHING STATE
        </span>
        <span
          className="ml-auto font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted tabular-nums"
          aria-label={`${doneCount} of ${total} refresh reads complete`}
        >
          {allDone ? `${total}/${total} done` : `${doneCount}/${total}`}
        </span>
      </div>
      <div
        className="rounded-lg border border-border-subtle bg-surface-card overflow-hidden"
        role="group"
        aria-label="Post-write state refresh"
      >
        {tools.map((tool, i) => (
          <ParallelToolsRow
            key={tool.toolUseId}
            glyph={getStepIcon(tool.toolName)}
            label={getStepLabel(tool.toolName)}
            sub={rowSub(tool)}
            status={toRowStatus(tool.status)}
            last={i === tools.length - 1}
          />
        ))}
      </div>

      {/* Cards rendered chronologically below the surface, only after
          the message has finished streaming. ToolBlockView's `headerless`
          mode skips the AgentStep header (already shown in the row above)
          and emits only the result card. `variant="post-write"` opts
          renderers like BalanceCard into a tighter 2-3 col + no-holdings
          presentation that fits inline below the receipt without dragging
          another ~80px of duplicated context onto the page. */}
      {!isStreaming &&
        tools.map((tool) =>
          tool.status === 'done' || tool.status === 'error' ? (
            <ToolBlockView
              key={`card-${tool.toolUseId}`}
              block={tool}
              isStreaming={false}
              headerless
              variant="post-write"
            />
          ) : null,
        )}
    </div>
  );
}
