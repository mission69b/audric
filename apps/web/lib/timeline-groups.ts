// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — Timeline grouping (B2.2)
//
// Pure function that takes a flat TimelineBlock[] and returns a list of
// "rendered items" — either a single block or a parallel-tool group.
// The renderer (ReasoningTimeline) walks the result and dispatches each
// item to the right component (BlockRouter for singles, ParallelToolsGroup
// for groups).
//
// The heuristic: adjacent `tool` blocks form a parallel group when their
// `startedAt` timestamps differ by less than `PARALLEL_THRESHOLD_MS`.
// 50ms matches the existing ToolSteps heuristic (which checks "≥2 running
// in flight at once") — both detect the same "agent dispatched multiple
// reads in parallel" UX. The time-window approach is more accurate for
// post-stream rendering where statuses have all settled.
//
// Non-tool blocks (thinking, text, todo, canvas, permission-card,
// pending-input) are always rendered as singles. Only adjacent tools group.
// ───────────────────────────────────────────────────────────────────────────

import type { TimelineBlock, ToolTimelineBlock } from './engine-types';

const PARALLEL_THRESHOLD_MS = 50;

/** Either a single block or an ordered run of tool blocks rendered as a group. */
export type TimelineRenderItem =
  | { kind: 'single'; block: TimelineBlock }
  | { kind: 'group'; tools: ToolTimelineBlock[] };

/**
 * Walk the timeline and emit render items. Tool blocks that started
 * within `PARALLEL_THRESHOLD_MS` of the previous tool block fold into
 * the open group; anything else closes the group and emits as singles.
 */
export function groupTimelineBlocks(blocks: TimelineBlock[]): TimelineRenderItem[] {
  const out: TimelineRenderItem[] = [];
  let openGroup: ToolTimelineBlock[] | null = null;

  const flushGroup = () => {
    if (openGroup) {
      if (openGroup.length === 1) {
        out.push({ kind: 'single', block: openGroup[0] });
      } else {
        out.push({ kind: 'group', tools: openGroup });
      }
      openGroup = null;
    }
  };

  for (const block of blocks) {
    if (block.type === 'tool') {
      if (openGroup && openGroup.length > 0) {
        const prev = openGroup[openGroup.length - 1];
        if (block.startedAt - prev.startedAt < PARALLEL_THRESHOLD_MS) {
          openGroup.push(block);
          continue;
        }
        flushGroup();
      }
      openGroup = [block];
    } else {
      flushGroup();
      out.push({ kind: 'single', block });
    }
  }
  flushGroup();

  return out;
}
