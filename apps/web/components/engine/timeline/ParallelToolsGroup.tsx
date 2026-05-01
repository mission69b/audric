'use client';

import type { ToolTimelineBlock } from '@/lib/engine-types';
import { AgentStep, getStepIcon, getStepLabel, type StepStatus } from '../AgentStep';
import { ToolBlockView } from './ToolBlockView';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ParallelToolsGroup (B2.2)
//
// Renders 2+ adjacent tool blocks that the timeline-grouping heuristic
// flagged as "fired in parallel" (startedAt within 50ms of each other).
// Mirrors the existing ChatMessage `ToolSteps` parallel layout — a
// "RUNNING TASKS IN PARALLEL" wrapper containing the per-tool steps as
// children, with each tool's result card rendered chronologically below.
// ───────────────────────────────────────────────────────────────────────────

interface ParallelToolsGroupProps {
  tools: ToolTimelineBlock[];
  /** Same isStreaming gate as ToolBlockView — hide cards while the
   *  message is still streaming so we don't pop in half-results. */
  isStreaming?: boolean;
}

function maxStatus(tools: ToolTimelineBlock[]): StepStatus {
  if (tools.some((t) => t.status === 'streaming' || t.status === 'running')) return 'running';
  if (tools.some((t) => t.status === 'error' || t.status === 'interrupted')) return 'error';
  return 'done';
}

export function ParallelToolsGroup({ tools, isStreaming }: ParallelToolsGroupProps) {
  if (tools.length === 0) return null;

  return (
    <div className="space-y-1">
      <AgentStep
        icon="⊞"
        label="RUNNING TASKS IN PARALLEL"
        status={maxStatus(tools)}
        collapsible
        defaultExpanded
      >
        <div className="space-y-0.5">
          {tools.map((tool) => (
            <AgentStep
              key={tool.toolUseId}
              icon={getStepIcon(tool.toolName)}
              label={getStepLabel(tool.toolName)}
              status={
                tool.status === 'streaming' || tool.status === 'running'
                  ? 'running'
                  : tool.status === 'error' || tool.status === 'interrupted'
                    ? 'error'
                    : 'done'
              }
            />
          ))}
        </div>
      </AgentStep>

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
