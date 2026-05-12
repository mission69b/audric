'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TimelineBlock, PendingAction } from '@/lib/engine-types';
import type { DenyReason } from './PermissionCard';
import type { WordSpan } from '@/lib/voice/word-alignment';
import { computeTextBlockVoiceSlices } from '@/lib/voice/timeline-voice-slices';
import { groupTimelineBlocks } from '@/lib/timeline-groups';
import { BlockRouter } from './timeline/BlockRouter';
import { ParallelToolsGroup } from './timeline/ParallelToolsGroup';
import { PostWriteRefreshSurface } from './timeline/PostWriteRefreshSurface';
import {
  computeThinkingCollapse,
  type ThinkingCollapseResult,
} from '@/lib/thinking-similarity';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ReasoningTimeline (B2.2 + B3.3 + B3.5)
//
// Replaces the static "tools section first → reasoning accordion → text
// last" layout with a chronological timeline built from the engine's
// SSE events. Driven entirely by `message.timeline` — the dual-write
// plumbing in B2.1 ensures this is populated before B2.2's ChatMessage
// gate flips.
//
// The component is intentionally thin: groupTimelineBlocks does the
// chronology + parallel-detection work; BlockRouter and ParallelToolsGroup
// do the rendering. This keeps each concern independently testable
// (timeline-groups.test.ts, block-renderer.stories.tsx in B2.3).
//
// [B3.3 / G8] Owns a `Map<blockIndex, 'expanded' | 'collapsed'>` for the
// thinking blocks so manual user toggles survive child unmount/remount
// (e.g. virtualization, parallel-group regrouping, status transitions).
// Auto-expand seeds happen ONCE per blockIndex, on first observation —
// status flipping streaming→done never re-seeds. The map is per-message
// (one ReasoningTimeline per assistant message) so toggles in one
// message can't bleed into another.
// ───────────────────────────────────────────────────────────────────────────

interface ReasoningTimelineProps {
  blocks: TimelineBlock[];
  isStreaming?: boolean;
  onActionResolve?: (
    action: PendingAction,
    approved: boolean,
    reason?: DenyReason,
    modifications?: Record<string, unknown>,
  ) => void;
  onSendMessage?: (text: string) => void;
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  walletAddress?: string | null;
  recentUserText?: string;
  /**
   * [B3.1 / audit Gap A] Forwarded to PermissionCardBlockView so the
   * timeline path matches the legacy renderer's auto-approve gating.
   * See `PermissionCardBlockView` for the contract.
   */
  // [F14-fix-2 / 2026-05-03] MUST include `steps` so bundle iteration
  // runs in `shouldClientAutoApprove`. See PermissionCardBlockView.tsx
  // F14-fix-2 comment for the full root-cause writeup.
  shouldAutoApprove?: (
    action: Pick<PendingAction, 'toolName' | 'input' | 'steps'>,
  ) => boolean;
  /**
   * [SPEC 7 P2.4b] Quote-Refresh ReviewCard wiring. Forwarded to the
   * `permission-card` block (only consulted on bundles flagged with
   * `canRegenerate`). Parent owns the round-trip to
   * `/api/engine/regenerate` and the post-success timeline mutation.
   */
  onRegenerate?: (action: PendingAction) => void;
  regeneratingAttemptIds?: ReadonlySet<string>;
  /**
   * [SPEC 9 v0.1.3 P9.4] Inline-form submit handler — forwarded to
   * `<PendingInputBlockView>` via `<BlockRouter>`. Receives
   * `(inputId, values)` and is wired up by the parent (`useEngine.handlePendingInputSubmit`).
   */
  onPendingInputSubmit?: (inputId: string, values: Record<string, unknown>) => void;
  /**
   * [B3.4 / Gap F] Voice playback context for THIS message. Set when:
   *   - `voice.state === 'speaking'`
   *   - `voice.speakingMessageId === message.id`
   *   - `voice.currentSpans !== null`
   * The renderer slices the spans per text block so each
   * `<TextBlockView>` can swap in `<VoiceHighlightedText>`. Undefined
   * on every non-active assistant message and during streaming.
   */
  voiceContext?: {
    spans: WordSpan[];
    spokenWordIndex: number;
  };
  /**
   * [S.123 v0.55.x] Forwarded to `BundleReceiptBlockView` (via BlockRouter)
   * for the inline "Sign back in" recovery button on session-expired
   * receipts. Wired to `useZkLogin.refresh` at the dashboard.
   */
  onSignBackIn?: () => void;
  /**
   * [SPEC 21.3] Last 3 assistant turns' thinking text content (oldest →
   * newest), excluding this message. Computed once per render in
   * `<UnifiedTimeline>` and passed down. ReasoningTimeline calls
   * `computeThinkingCollapse` per thinking block to decide whether to
   * render the collapsed "same as turn N" row. Default: empty array
   * (no comparison data → no collapse → render normally).
   */
  priorThinkingTexts?: ReadonlyArray<string>;
  /**
   * [SPEC 21.3] First-turn carve-out flag. True when this is the first
   * assistant message in the session — thinking always renders fully
   * to set user expectations. Default: false.
   */
  isFirstAssistantTurn?: boolean;
}

export function ReasoningTimeline({
  blocks,
  isStreaming,
  onActionResolve,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
  shouldAutoApprove,
  voiceContext,
  onRegenerate,
  regeneratingAttemptIds,
  onPendingInputSubmit,
  onSignBackIn,
  priorThinkingTexts,
  isFirstAssistantTurn,
}: ReasoningTimelineProps) {
  // [B3.3 / G8] Manual-state-preserved expansion map for thinking blocks.
  // Lazy-init from the blocks present at first mount (rehydration case)
  // so we don't drop a frame computing defaults in `useEffect`.
  const [thinkingExpanded, setThinkingExpanded] = useState<
    Map<number, boolean>
  >(() => seedExpandedMap(blocks));

  // Seed any new blockIndex that arrived after first mount. Existing
  // entries (whether they came from initial seed or a user click) are
  // never overwritten — this is what gives the rule "auto-expand on
  // first emission ONLY". A streaming→done transition does NOT re-seed.
  useEffect(() => {
    setThinkingExpanded((prev) => {
      let next = prev;
      let changed = false;
      for (const block of blocks) {
        if (block.type !== 'thinking') continue;
        if (next.has(block.blockIndex)) continue;
        if (!changed) {
          next = new Map(prev);
          changed = true;
        }
        next.set(block.blockIndex, block.status === 'streaming');
      }
      return changed ? next : prev;
    });
  }, [blocks]);

  const toggleThinking = useCallback((blockIndex: number) => {
    setThinkingExpanded((prev) => {
      const next = new Map(prev);
      next.set(blockIndex, !(prev.get(blockIndex) ?? false));
      return next;
    });
  }, []);

  // [B3.4 / Gap F] Compute one voice slice per text block when TTS is
  // active. Memoized on (blocks, spans) — the slices don't change as
  // `spokenWordIndex` advances, so re-running this every rAF tick would
  // be wasteful. Renders past `<TextBlockView>` use the slice plus the
  // current `spokenWordIndex` to advance their highlight.
  const voiceSlices = useMemo(
    () =>
      voiceContext
        ? computeTextBlockVoiceSlices(blocks, voiceContext.spans)
        : null,
    [blocks, voiceContext],
  );

  // [SPEC 21.3] Pre-compute per-thinking-block collapse decisions so the
  // render below is a pure lookup. Carve-outs that depend on the IMMEDIATELY
  // preceding block (error recovery — prior `tool` block is `isError`) are
  // detected by walking the blocks array once. Cross-message comparisons use
  // `priorThinkingTexts` (computed by `<UnifiedTimeline>` from the message
  // graph). Streaming blocks never collapse — the helper itself doesn't gate
  // on streaming, so the gate lives in `<ThinkingBlockView>` (it inspects
  // `block.status === 'streaming'`).
  const thinkingCollapseByBlockIndex = useMemo(() => {
    const map = new Map<number, ThinkingCollapseResult>();
    if (!blocks) return map;
    const priors = priorThinkingTexts ?? [];
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (block.type !== 'thinking') continue;
      // Error-recovery flag: the IMMEDIATELY preceding block is a tool
      // block whose result errored. The user is watching the LLM regroup
      // — that's high-signal thinking, never collapse it.
      const prior = i > 0 ? blocks[i - 1] : undefined;
      const isErrorRecovery =
        prior?.type === 'tool' && prior.status === 'done' && prior.isError === true;
      const result = computeThinkingCollapse(block.text, priors, {
        isFirstTurn: isFirstAssistantTurn,
        isErrorRecovery,
        // `isAmbiguousInput` is a possible future extension — would
        // require the engine to surface a `clarification_needed` flag
        // on the tool result. Out of scope for v0.1.
      });
      map.set(block.blockIndex, result);
    }
    return map;
  }, [blocks, priorThinkingTexts, isFirstAssistantTurn]);

  if (!blocks || blocks.length === 0) return null;

  const items = groupTimelineBlocks(blocks);

  return (
    <div className="space-y-2">
      {/* [SPEC 8 v0.5.2 hotfix · Bug D] The TASK INITIATED divider lives
          ONLY in `UnifiedTimeline` (above each user message) — rendering
          it here too produced 2-3 dividers per logical turn (chat msg
          + resume narration each had their own). The primitive
          `<TaskInitiated />` stays in the codebase for the future
          "RESUMED" variant, but is intentionally not invoked here. */}
      {items.map((item, i) => {
        if (item.kind === 'group') {
          return (
            <ParallelToolsGroup
              key={`group-${i}-${item.tools[0].toolUseId}`}
              tools={item.tools}
              isStreaming={isStreaming}
              onSendMessage={onSendMessage}
            />
          );
        }
        if (item.kind === 'pwr-group') {
          return (
            <PostWriteRefreshSurface
              key={`pwr-${i}-${item.tools[0].toolUseId}`}
              tools={item.tools}
              isStreaming={isStreaming}
            />
          );
        }
        const block = item.block;
        const voiceSlice =
          block.type === 'text' && voiceSlices ? voiceSlices.get(block) : undefined;
        return (
          <BlockRouter
            key={`block-${i}-${blockKey(block)}`}
            block={block}
            isStreaming={isStreaming}
            onActionResolve={onActionResolve}
            onSendMessage={onSendMessage}
            contacts={contacts}
            walletAddress={walletAddress}
            recentUserText={recentUserText}
            shouldAutoApprove={shouldAutoApprove}
            onRegenerate={onRegenerate}
            regeneratingAttemptIds={regeneratingAttemptIds}
            onPendingInputSubmit={onPendingInputSubmit}
            onSignBackIn={onSignBackIn}
            thinkingExpanded={
              block.type === 'thinking'
                ? thinkingExpanded.get(block.blockIndex) ??
                  block.status === 'streaming'
                : undefined
            }
            onToggleThinking={
              block.type === 'thinking'
                ? () => toggleThinking(block.blockIndex)
                : undefined
            }
            thinkingCollapseInfo={
              block.type === 'thinking'
                ? thinkingCollapseByBlockIndex.get(block.blockIndex)
                : undefined
            }
            voiceSlice={voiceSlice}
            spokenWordIndex={voiceContext?.spokenWordIndex}
          />
        );
      })}
    </div>
  );
}

/** Initial seed for the thinking-expansion map. Streaming = expanded,
 *  done (rehydrate case) = collapsed. */
function seedExpandedMap(blocks: TimelineBlock[]): Map<number, boolean> {
  const m = new Map<number, boolean>();
  for (const b of blocks) {
    if (b.type !== 'thinking') continue;
    if (m.has(b.blockIndex)) continue;
    m.set(b.blockIndex, b.status === 'streaming');
  }
  return m;
}

/** Stable key derivation per block type — id-style fields where they
 *  exist, position-fallback for stateless blocks. */
function blockKey(block: TimelineBlock): string {
  switch (block.type) {
    case 'thinking':
      return `t${block.blockIndex}`;
    case 'tool':
      return block.toolUseId;
    case 'todo':
      return `todo-${block.toolUseId}`;
    case 'canvas':
      return `canvas-${block.toolUseId}`;
    case 'permission-card':
      return `pcard-${block.payload.attemptId ?? block.payload.toolUseId}`;
    case 'pending-input':
      return `pinput-${block.inputId}`;
    case 'text':
      return 'text';
    case 'regenerated':
      return `regen-${block.originalAttemptId}`;
    case 'contact-resolved':
      return `contact-${block.toolUseId}-${block.contactAddress}`;
    case 'plan-stream':
      return `plan-${block.attemptId}`;
    case 'bundle-receipt':
      return `bundle-receipt-${block.attemptId}`;
  }
}
