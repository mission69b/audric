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
// Three grouping rules, in priority order:
//
//   0. Regen-cluster (SPEC 23B-MPP6 UX polish, 2026-05-12): when 2+
//      pay_api blocks appear in the SAME message timeline, group them
//      into a single side-by-side cluster (kind: 'group') anchored at
//      the position of the FIRST pay_api block. Non-pay_api blocks
//      between or after the pay_api blocks are deferred to AFTER the
//      cluster. Captures the SEMANTIC intent: an original + N regens
//      are alternate outputs of the same prompt and belong together.
//      Fires regardless of timestamp deltas (live regen blocks have
//      real timestamps separated by tens of seconds, so the timing-
//      based rule below would never group them).
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
const isPayApi = (b: TimelineBlock): b is ToolTimelineBlock =>
  b.type === 'tool' && b.toolName === 'pay_api';

/**
 * Walk the timeline and emit render items.
 *
 * Two open buffers run in parallel — one for PWR runs, one for normal
 * parallel runs. A tool block extends the matching buffer (PWR or
 * timing-based); anything else flushes both. PWR wins over timing — a
 * tool with `source === 'pwr'` never collapses into a non-PWR parallel
 * group even when the timestamps line up.
 *
 * Regen-cluster pre-pass (SPEC 23B-MPP6 UX polish, 2026-05-12): if 2+
 * pay_api blocks exist, peel them out and emit them as a single cluster
 * at the position of the FIRST pay_api. Recursion on the remaining
 * non-pay_api blocks is safe because they contain zero pay_api by
 * construction — the regen-cluster branch returns false on the recursive
 * call and falls through to the standard single-pass logic.
 */
export function groupTimelineBlocks(blocks: TimelineBlock[]): TimelineRenderItem[] {
  const payApiBlocks = blocks.filter(isPayApi);
  if (payApiBlocks.length >= 2) {
    return groupRegenCluster(blocks, payApiBlocks);
  }

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

/**
 * Regen-cluster grouping — SPEC 23B-MPP6 UX polish, 2026-05-12.
 *
 * When 2+ pay_api blocks appear in one message timeline, peel them out
 * and emit them as one side-by-side cluster anchored at the position of
 * the first pay_api block. Surrounding non-pay_api blocks (text
 * narration, PWR balance refresh, thinking) get partitioned into
 * "before" (rendered above the cluster) and "after" (rendered below).
 *
 * Why anchor at the FIRST pay_api position rather than the last or end:
 *   - Visual consistency with the rehydrated state, which already
 *     groups pay_api blocks together near the top of the message
 *     because synthesizeTimelineFromMessage stamps startedAt=0 and
 *     emits all tools back-to-back.
 *   - "Comparison up top, context below" is the natural reading order
 *     for image/audio variants — the user wants to see the options
 *     side-by-side first, then the supporting receipts/narration.
 *
 * Why recurse on before/after partitions rather than emit each block
 * as a single: PWR runs in the after-partition need to flow through
 * the existing pwr-group rule. E.g. after-partition might be
 * [balance_check (PWR), savings_info (PWR), text] — recursion emits
 * [pwr-group([balance, savings]), single(text)] correctly. Emitting
 * blindly as singles would lose the post-write-refresh surface
 * framing.
 *
 * Pure function. No mutation of the input array; new arrays are
 * constructed for partitioning.
 */
function groupRegenCluster(
  blocks: TimelineBlock[],
  payApiBlocks: ToolTimelineBlock[],
): TimelineRenderItem[] {
  const beforeCluster: TimelineBlock[] = [];
  const afterCluster: TimelineBlock[] = [];

  let firstPayApiSeen = false;
  for (const block of blocks) {
    if (isPayApi(block)) {
      firstPayApiSeen = true;
      continue;
    }
    if (!firstPayApiSeen) {
      beforeCluster.push(block);
    } else {
      afterCluster.push(block);
    }
  }

  return [
    ...groupTimelineBlocks(beforeCluster),
    { kind: 'group', tools: payApiBlocks },
    ...groupTimelineBlocks(afterCluster),
  ];
}
