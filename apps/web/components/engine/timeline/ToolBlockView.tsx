'use client';

import type { ToolTimelineBlock, ToolExecution } from '@/lib/engine-types';
import { AgentStep, getStepIcon, getStepLabel } from '../AgentStep';
import { ToolResultCard } from '../ToolResultCard';
import { SkeletonCard } from '../cards/SkeletonCard';
import { getSkeletonVariant } from '../cards/skeleton-variants';

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
// `attemptCount` (SPEC 8 v0.3 G5, wired in B3.2) renders as a header
// subtitle "attempt N · 1.4s" only when the engine reports N>1 — first-try
// successes leave the field undefined so the header stays clean.
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
  /** [SPEC 23B-W1] Forward to `<ToolResultCard>` so consumers like
   *  `<PostWriteRefreshSurface>` can request a tighter post-write
   *  presentation (e.g. the 2-3 col `BalanceCard` instead of the full
   *  3-5 col + holdings card). Defaults to `'default'`. */
  variant?: 'default' | 'post-write';
  /** [SPEC 23B-MPP6] Forwarded to `<ToolResultCard>` so per-vendor MPP
   *  renderers (DALL-E, ElevenLabs) can render a `<ReviewCard>` that
   *  fires a synthesized "Regenerate the preview" / "Cancel — discard…"
   *  user message via the engine. Threaded the same way `CanvasBlockView`
   *  receives `onSendMessage` for canvas-internal `onAction` handlers. */
  onSendMessage?: (text: string) => void;
  /** [SPEC 23B-MPP6-fastpath / 2026-05-12] Async callback invoked by
   *  `<ReviewCard>`'s Regenerate button (fastpath path). Receives the
   *  toolUseId of the original `pay_api` call to re-dispatch. This view
   *  binds `block.toolUseId` into the closure passed to `<ToolResultCard>`
   *  so renderers see a no-arg `() => Promise<void>` and don't need to
   *  thread toolUseIds themselves. Wired from
   *  `dashboard-content.tsx:handleRegenerateToolCall`. */
  onRegenerateToolCall?: (toolUseId: string) => Promise<void>;
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

export function ToolBlockView({
  block,
  isStreaming,
  headerless,
  variant,
  onSendMessage,
  onRegenerateToolCall,
}: ToolBlockViewProps) {
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

  // [SPEC 8 v0.5.1 B3.2] Build the `attempt N · 1.4s` header meta when
  // either side has a value worth surfacing.
  //  - Retry count surfaces only when > 1 (engine omits otherwise).
  //  - Duration surfaces once the tool settles (startedAt + endedAt).
  // Both pieces are joined with ` · ` so a tool with only retry info
  // (still running on retry 2) renders "attempt 2", and a tool with
  // only duration (1st-try success) renders "1.4s".
  const headerMetaParts: string[] = [];
  if (block.attemptCount !== undefined && block.attemptCount > 1) {
    headerMetaParts.push(`attempt ${block.attemptCount}`);
  }
  // `startedAt: 0` is a legitimate timestamp in tests (and theoretically at
  // epoch boot), so use `!== undefined` rather than truthiness.
  if (block.startedAt !== undefined && block.endedAt !== undefined) {
    const seconds = Math.max(0, (block.endedAt - block.startedAt) / 1000);
    headerMetaParts.push(`${seconds.toFixed(1)}s`);
  }
  // Only set `meta` when retry info is present — the duration alone is
  // ambient noise we don't want to add to the common-case header. The
  // spec's "TOOL · attempt N · 1.4s" pattern is a retry surface, not a
  // generic timing badge.
  const headerMeta =
    block.attemptCount !== undefined && block.attemptCount > 1 && headerMetaParts.length > 0
      ? headerMetaParts.join(' · ')
      : undefined;

  // [SPEC 23B-MPP6 UX polish / 2026-05-12] User-initiated regen marker
  // (the "↻ Regenerated" chip rendered above the card) was REMOVED here
  // 2026-05-12 ~19:45 AEST after founder smoke caught a layout-shift
  // bug. Mechanic: handleRegenerateToolCall calls upsertToolBlock twice
  // — first with status='running' (no result, isSettled=false → chip
  // gate false → no chip, no card), then ~3s later with endedAt+result
  // populated (isSettled=true → chip AND ToolResultCard appear in the
  // SAME tick). User read this as "the chip pushed the card down" — a
  // ~15px shift that landed badly in the side-by-side cluster grid.
  //
  // The chip's job (signal "this is a user-driven regen") is already
  // covered by:
  //   1. Source card A's footer collapses entirely on regen-success
  //      (audric `32b1e4e`) — clear "this is no longer the active option"
  //   2. New card B's footer is fully interactive (Review / ↻ Regenerate /
  //      Cancel) — clear "this is the live one"
  //   3. In cluster mode, MppReceiptGrid groups regenerated cards
  //      side-by-side (audric `c3fd291`) — visually obvious they're
  //      related
  //   4. In sequential mode, position + footer state distinguishes
  //      original vs regen
  //
  // The chip was redundant reinforcement that introduced layout cost.
  // Removing it satisfies "less is more" + Surgical Changes principle.
  // The block.source field stays threaded through upsertToolBlock for
  // future consumers (e.g. analytics, future per-source styling); only
  // the visual chip is gone.

  return (
    <div className="space-y-1">
      {!headerless && (
        <AgentStep
          icon={getStepIcon(block.toolName, block.input)}
          label={getStepLabel(block.toolName)}
          status={stepStatus}
          meta={headerMeta}
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

      {/* SPEC 23C C2 — skeleton-first render. While the tool is running,
       *  reserve the eventual card's geometry so the real card slides in
       *  without layout shift. Skipped when:
       *  - `headerless` (parallel group) — ParallelToolsGroup renders its
       *    own grouped placeholder; double-rendering would stack two
       *    skeletons.
       *  - The tool has no card surface (skeletonVariant === null) —
       *    eventually no card will render either, so showing a skeleton
       *    would be a lie. */}
      {stepStatus === 'running' && !headerless && (() => {
        const skeletonVariant = getSkeletonVariant(block.toolName, block.input);
        if (!skeletonVariant) return null;
        return (
          <SkeletonCard
            variant={skeletonVariant}
            ariaLabel={`Loading ${getStepLabel(block.toolName)}`}
          />
        );
      })()}

      {isSettled && !isStreaming && (
        <ToolResultCard
          tool={execution}
          variant={variant}
          onSendMessage={onSendMessage}
          onRegenerate={
            onRegenerateToolCall
              ? () => onRegenerateToolCall(block.toolUseId)
              : undefined
          }
        />
      )}
    </div>
  );
}
