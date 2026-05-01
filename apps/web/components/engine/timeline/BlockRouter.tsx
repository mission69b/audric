'use client';

import type { TimelineBlock, PendingAction } from '@/lib/engine-types';
import type { DenyReason } from '../PermissionCard';
import { ThinkingBlockView } from './ThinkingBlockView';
import { ToolBlockView } from './ToolBlockView';
import { TextBlockView } from './TextBlockView';
import { TodoBlockView } from './TodoBlockView';
import { CanvasBlockView } from './CanvasBlockView';
import { PermissionCardBlockView } from './PermissionCardBlockView';
import { PendingInputBlockView } from './PendingInputBlockView';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — BlockRouter (B2.2)
//
// Switch over TimelineBlock.type → render the right per-block view.
// TypeScript exhaustiveness on the discriminated union guarantees we
// never miss a variant. When SPEC 9 adds new block types, the compiler
// flags every router that hasn't been updated.
//
// Single-block path. Parallel groups go through ParallelToolsGroup.
// ───────────────────────────────────────────────────────────────────────────

interface BlockRouterProps {
  block: TimelineBlock;
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
   * [B3.1 / audit Gap A] Forwarded to `PermissionCardBlockView` so the
   * new timeline path matches `ChatMessage.tsx`'s legacy auto-approve
   * gating. See `PermissionCardBlockView` for the contract.
   */
  shouldAutoApprove?: (action: Pick<PendingAction, 'toolName' | 'input'>) => boolean;
}

export function BlockRouter({
  block,
  isStreaming,
  onActionResolve,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
  shouldAutoApprove,
}: BlockRouterProps) {
  switch (block.type) {
    case 'thinking':
      return <ThinkingBlockView block={block} />;

    case 'tool':
      return <ToolBlockView block={block} isStreaming={isStreaming} />;

    case 'text':
      return <TextBlockView block={block} />;

    case 'todo':
      return <TodoBlockView block={block} />;

    case 'canvas':
      return <CanvasBlockView block={block} onSendMessage={onSendMessage} />;

    case 'permission-card':
      if (!onActionResolve) return null;
      return (
        <PermissionCardBlockView
          block={block}
          onActionResolve={onActionResolve}
          contacts={contacts}
          walletAddress={walletAddress}
          recentUserText={recentUserText}
          shouldAutoApprove={shouldAutoApprove}
        />
      );

    case 'pending-input':
      return <PendingInputBlockView block={block} />;
  }
}
