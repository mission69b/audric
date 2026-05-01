'use client';

import type { ToolTimelineBlock } from '@/lib/engine-types';
import { getStepIcon, getStepLabel } from '../AgentStep';
import { ToolBlockView } from './ToolBlockView';
import {
  ParallelToolsRow,
  type ParallelRowStatus,
} from './primitives/ParallelToolsRow';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ParallelToolsGroup (B2.2 + B3.5)
//
// Renders 2+ adjacent tool blocks that the timeline-grouping heuristic
// flagged as "fired in parallel" (startedAt within 50ms of each other).
//
// B3.5 (audit Gap C) ports this surface from the AgentStep nesting to
// the v2 demo's "lit-up rows" card primitive (`<ParallelToolsRow>`):
//
//   ⊞ RUNNING TASKS IN PARALLEL                   2/3
//   ┌──────────────────────────────────────────────────┐
//   │ 📊  PORTFOLIO ANALYSIS    fetched 4 wallets    ●  DONE │
//   │ 💰  BALANCE CHECK         fetching…           ◌  …   │
//   │ 📈  RATES INFO            6.4% USDC · NAVI    ●  DONE │
//   └──────────────────────────────────────────────────┘
//
// Each row's background warms (faint green / red / amber tint) once the
// tool settles — gives the user the "things are landing" beat the v0.3
// AgentStep tree was missing. Cards still render chronologically below
// the group once streaming ends (unchanged behavior).
// ───────────────────────────────────────────────────────────────────────────

interface ParallelToolsGroupProps {
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

/** Build the "fetched X" / "fetching…" sub-line for a row. We don't have
 *  rich per-tool result previews wired in yet (the cards below carry the
 *  full payload), so the v2 demo's evocative sub-text is approximated
 *  with the tool's progress message while running and a generic "ran in
 *  Ns" once settled. The cards below will still carry the actual result. */
function rowSub(tool: ToolTimelineBlock): string {
  if (tool.status === 'streaming' || tool.status === 'running') {
    return tool.progress?.message ?? 'querying…';
  }
  if (tool.status === 'interrupted') return 'interrupted';
  if (tool.status === 'error') return 'failed';
  if (tool.startedAt !== undefined && tool.endedAt !== undefined) {
    const seconds = Math.max(0, (tool.endedAt - tool.startedAt) / 1000);
    return `ran in ${seconds.toFixed(1)}s`;
  }
  return 'done';
}

export function ParallelToolsGroup({ tools, isStreaming }: ParallelToolsGroupProps) {
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
          ⊞
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-fg-secondary">
          Running tasks in parallel
        </span>
        <span
          className="ml-auto font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted tabular-nums"
          aria-label={`${doneCount} of ${total} tools complete`}
        >
          {allDone ? `${total}/${total} done` : `${doneCount}/${total}`}
        </span>
      </div>
      <div
        className="rounded-lg border border-border-subtle bg-surface-card overflow-hidden"
        role="group"
        aria-label="Parallel tool execution"
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

      {/* Cards rendered chronologically below the group, only after the
          message has finished streaming. ToolBlockView's `headerless`
          mode skips the AgentStep header (already shown in the group
          row above) and emits only the result card. */}
      {!isStreaming &&
        tools.map((tool) =>
          tool.status === 'done' || tool.status === 'error' ? (
            <ToolBlockView
              key={`card-${tool.toolUseId}`}
              block={tool}
              isStreaming={false}
              headerless
            />
          ) : null,
        )}
    </div>
  );
}
