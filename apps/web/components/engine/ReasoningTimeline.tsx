'use client';

import type { TimelineBlock, PendingAction } from '@/lib/engine-types';
import type { DenyReason } from './PermissionCard';
import { groupTimelineBlocks } from '@/lib/timeline-groups';
import { BlockRouter } from './timeline/BlockRouter';
import { ParallelToolsGroup } from './timeline/ParallelToolsGroup';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — ReasoningTimeline (B2.2)
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
// Optional callbacks (onActionResolve / onSendMessage / wallet context)
// are forwarded straight through to the leaf renderers that need them
// (PermissionCardBlockView, CanvasBlockView).
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
}

export function ReasoningTimeline({
  blocks,
  isStreaming,
  onActionResolve,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
}: ReasoningTimelineProps) {
  if (!blocks || blocks.length === 0) return null;

  const items = groupTimelineBlocks(blocks);

  return (
    <div className="space-y-2">
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
        return (
          <BlockRouter
            key={`block-${i}-${blockKey(item.block)}`}
            block={item.block}
            isStreaming={isStreaming}
            onActionResolve={onActionResolve}
            onSendMessage={onSendMessage}
            contacts={contacts}
            walletAddress={walletAddress}
            recentUserText={recentUserText}
          />
        );
      })}
    </div>
  );
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
