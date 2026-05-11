// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — Timeline grouping (B2.2)
//
// Pure function that takes a flat TimelineBlock[] and returns a list of
// "rendered items" — either a single block, a parallel-tool group, or
// (SPEC 23A-A6) a post-write-refresh group. The renderer
// (ReasoningTimeline) walks the result and dispatches each item to the
// right component (BlockRouter for singles, ParallelToolsGroup for
// parallel groups, PostWriteRefreshSurface for PWR groups).
//
// Two grouping rules, in priority order:
//
//   1. PWR run: any consecutive run of `tool` blocks all carrying
//      `source === 'pwr'` (engine 1.28+ stamps these on the balance +
//      savings reads it injects after a write). The PWR rule wins
//      regardless of timing — these reads typically run in parallel
//      anyway, but a slow PWR read shouldn't accidentally split the
//      surface in two. Single-PWR-tool runs still get the surface so
//      the user sees "AFTER YOUR APPROVAL" framing even on a one-read
//      refresh.
//
//   2. Parallel run: any other adjacent `tool` blocks whose `startedAt`
//      timestamps differ by less than `PARALLEL_THRESHOLD_MS`. 50ms
//      matches the legacy ToolSteps heuristic.
//
// Non-tool blocks (thinking, text, todo, canvas, permission-card,
// pending-input) are always singles. They also break any open group.
// ───────────────────────────────────────────────────────────────────────────

import type { TimelineBlock, ToolTimelineBlock } from './engine-types';

const PARALLEL_THRESHOLD_MS = 50;

/** A single block, a parallel-tool run, or a post-write-refresh run. */
export type TimelineRenderItem =
  | { kind: 'single'; block: TimelineBlock }
  | { kind: 'group'; tools: ToolTimelineBlock[] }
  | { kind: 'pwr-group'; tools: ToolTimelineBlock[] };

const isPwr = (b: ToolTimelineBlock): boolean => b.source === 'pwr';

/**
 * Walk the timeline and emit render items.
 *
 * Two open buffers run in parallel — one for PWR runs, one for normal
 * parallel runs. A tool block extends the matching buffer (PWR or
 * timing-based); anything else flushes both. PWR wins over timing — a
 * tool with `source === 'pwr'` never collapses into a non-PWR parallel
 * group even when the timestamps line up.
 */
export function groupTimelineBlocks(blocks: TimelineBlock[]): TimelineRenderItem[] {
  const out: TimelineRenderItem[] = [];
  let openParallel: ToolTimelineBlock[] | null = null;
  let openPwr: ToolTimelineBlock[] | null = null;

  const flushParallel = () => {
    if (openParallel) {
      if (openParallel.length === 1) {
        out.push({ kind: 'single', block: openParallel[0] });
      } else {
        out.push({ kind: 'group', tools: openParallel });
      }
      openParallel = null;
    }
  };

  const flushPwr = () => {
    if (openPwr) {
      // PWR groups always render with the surface, even at length 1 —
      // the framing ("AFTER YOUR APPROVAL") is the point, not the
      // visual cluster.
      out.push({ kind: 'pwr-group', tools: openPwr });
      openPwr = null;
    }
  };

  for (const block of blocks) {
    if (block.type === 'tool') {
      if (isPwr(block)) {
        flushParallel();
        if (openPwr) {
          openPwr.push(block);
        } else {
          openPwr = [block];
        }
        continue;
      }
      flushPwr();
      if (openParallel && openParallel.length > 0) {
        const prev = openParallel[openParallel.length - 1];
        if (block.startedAt - prev.startedAt < PARALLEL_THRESHOLD_MS) {
          openParallel.push(block);
          continue;
        }
        flushParallel();
      }
      openParallel = [block];
    } else {
      flushParallel();
      flushPwr();
      out.push({ kind: 'single', block });
    }
  }
  flushParallel();
  flushPwr();

  return out;
}
