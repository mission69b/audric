'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TimelineBlock, PendingAction } from '@/lib/engine-types';
import type { DenyReason } from './PermissionCard';
import type { WordSpan } from '@/lib/voice/word-alignment';
import { computeTextBlockVoiceSlices } from '@/lib/voice/timeline-voice-slices';
import { groupTimelineBlocks } from '@/lib/timeline-groups';
import { BlockRouter } from './timeline/BlockRouter';
import { ParallelToolsGroup } from './timeline/ParallelToolsGroup';

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
  shouldAutoApprove?: (action: Pick<PendingAction, 'toolName' | 'input'>) => boolean;
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
  }
}
