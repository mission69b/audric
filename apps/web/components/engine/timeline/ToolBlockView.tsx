'use client';

import type { ToolTimelineBlock, ToolExecution } from '@/lib/engine-types';
import { AgentStep, getStepIcon, getStepLabel } from '../AgentStep';
import { ToolResultCard } from '../ToolResultCard';

/** Subset of StepStatus this mapping ever returns — also compatible
 *  with ToolExecution.status which doesn't have 'pending'. */
type RunStatus = 'running' | 'done' | 'error';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ToolBlockView (B2.2)
//
// Renders one tool block: the AgentStep header (icon + label + status)
// plus, when the tool has settled, the existing ToolResultCard inline.
// This preserves the today's rich-card UX (BalCard, RatesCard, etc.) but
// in chronological order — each card lands right after its tool call,
// not deferred to the bottom of the message.
//
// Progress (mid-execution `tool_progress` events from long-running tools
// like Cetus swap_execute or protocol_deep_dive) renders as a single
// indented line under the step header. Per spec, this kills the static-
// spinner dead-air on the worst-offender ~10% of tool calls.
//
// `attemptCount` (SPEC 8 v0.3 G5) is reserved for the ToolBlock shape
// but the visual surface ("attempt 2 · 1.4s" header subtitle) lands in
// B3 alongside the tool-retry test cases.
// ───────────────────────────────────────────────────────────────────────────

interface ToolBlockViewProps {
  block: ToolTimelineBlock;
  /** Hide the result card while the message is still streaming, mirroring
   *  ChatMessage's `!message.isStreaming` gate so cards don't pop in
   *  half-rendered while the LLM is still working. */
  isStreaming?: boolean;
  /** Skip the AgentStep header — used by ParallelToolsGroup which
   *  renders a unified group header above the per-tool cards. */
  headerless?: boolean;
}

/** Map TimelineBlock status (5 states) to the run status the renderers
 *  actually need (3 states). 'pending' from StepStatus is unused here —
 *  the engine never marks a tool block as pending; tool blocks are born
 *  in the 'running' state on tool_start. */
function toRunStatus(s: ToolTimelineBlock['status']): RunStatus {
  switch (s) {
    case 'streaming':
    case 'running':
      return 'running';
    case 'done':
      return 'done';
    case 'error':
    case 'interrupted':
      return 'error';
  }
}

export function ToolBlockView({ block, isStreaming, headerless }: ToolBlockViewProps) {
  const stepStatus = toRunStatus(block.status);
  const isSettled = block.status === 'done' || block.status === 'error';

  // Construct a ToolExecution for ToolResultCard. The timeline block is
  // a strict superset of ToolExecution — same shape minus the lifecycle
  // status mapping above.
  const execution: ToolExecution = {
    toolName: block.toolName,
    toolUseId: block.toolUseId,
    input: block.input,
    status: stepStatus,
    result: block.result,
    isError: block.isError,
  };

  return (
    <div className="space-y-1">
      {!headerless && (
        <AgentStep
          icon={getStepIcon(block.toolName)}
          label={getStepLabel(block.toolName)}
          status={stepStatus}
        />
      )}

      {block.progress && stepStatus === 'running' && !headerless && (
        <div className="pl-7 text-[11px] text-fg-muted font-mono leading-snug">
          {block.progress.pct !== undefined && (
            <span className="mr-2 tabular-nums">{block.progress.pct}%</span>
          )}
          <span>{block.progress.message}</span>
        </div>
      )}

      {isSettled && !isStreaming && (
        <ToolResultCard tool={execution} />
      )}
    </div>
  );
}
