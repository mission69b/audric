'use client';

import type { PermissionCardTimelineBlock, PendingAction } from '@/lib/engine-types';
import { PermissionCard, type DenyReason } from '../PermissionCard';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — PermissionCardBlockView (B2.2 + B3.1 lifecycle gates)
//
// Typed slot for the existing PermissionCard component. SPEC 7 v0.3.2
// will own the multi-step PermissionCard renderer (regenerate button,
// quote-age badge, multi-row layout) — this block exists in the timeline
// taxonomy so SPEC 7 has a chronologically positioned home for it.
//
// B3.1 (audit Gaps A + B):
//  - `shouldAutoApprove`: when host opts an action into auto-approve, we
//    must NOT briefly flicker the approve/deny UI. The legacy renderer in
//    `ChatMessage.tsx` already gates on this; the new timeline path now
//    matches that behavior here so flag flip is a no-visual-regression.
//  - `block.status !== 'pending'`: once `useEngine.resolveAction` flips
//    the matching timeline block via `markPermissionCardResolved`, the
//    card has to disappear — same UX as today's legacy path where the
//    card unmounts when `message.pendingAction` clears. Without this
//    guard, scrolling back to a resolved turn shows an "active" card.
// ───────────────────────────────────────────────────────────────────────────

interface PermissionCardBlockViewProps {
  block: PermissionCardTimelineBlock;
  onActionResolve: (
    action: PendingAction,
    approved: boolean,
    reason?: DenyReason,
    modifications?: Record<string, unknown>,
  ) => void;
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  walletAddress?: string | null;
  recentUserText?: string;
  /**
   * [B3.1 / audit Gap A] Same predicate `ChatMessage.tsx` legacy path
   * uses. Returning `true` makes the renderer skip the card entirely so
   * auto-approved writes execute without surfacing approve/deny UI. The
   * actual auto-approval round-trip happens in the parent (it must call
   * `onActionResolve(action, true, ...)` itself); this just keeps the
   * timeline visually clean while that happens.
   */
  shouldAutoApprove?: (action: Pick<PendingAction, 'toolName' | 'input'>) => boolean;
  /**
   * [SPEC 7 P2.4b] Quote-Refresh ReviewCard. When the underlying
   * pending action is a bundle with `canRegenerate === true`, the
   * card surfaces a "↻ Regenerate" button that calls this handler.
   * Parent (`useEngine.handleRegenerate`) is responsible for hitting
   * `/api/engine/regenerate`, swapping in the fresh `PendingAction`,
   * and pushing a `RegeneratedTimelineBlock` for the re-fired reads.
   */
  onRegenerate?: (action: PendingAction) => void;
  /**
   * [SPEC 7 P2.4b] Set of `attemptId`s currently mid-flight on the
   * regenerate endpoint. The card shows the spinner-state Regenerate
   * button when its own `payload.attemptId` is in this set.
   */
  regeneratingAttemptIds?: ReadonlySet<string>;
}

export function PermissionCardBlockView({
  block,
  onActionResolve,
  contacts,
  walletAddress,
  recentUserText,
  shouldAutoApprove,
  onRegenerate,
  regeneratingAttemptIds,
}: PermissionCardBlockViewProps) {
  if (block.status !== 'pending') return null;
  if (shouldAutoApprove?.({ toolName: block.payload.toolName, input: block.payload.input })) {
    return null;
  }
  // [SPEC 7 P2.4b] Only wire the regenerate slot when the engine flagged
  // the bundle as refreshable AND the host gave us a handler. Single-step
  // actions never get a regenerate button (the spec restricts this to
  // bundle quote refresh). `steps.length >= 2` mirrors `PermissionCard`'s
  // own `isBundle` check.
  const isBundle =
    Array.isArray(block.payload.steps) && block.payload.steps.length >= 2;
  const showRegenerate = Boolean(
    onRegenerate &&
      isBundle &&
      block.payload.canRegenerate &&
      block.payload.regenerateInput,
  );
  return (
    <PermissionCard
      action={block.payload}
      onResolve={onActionResolve}
      contacts={contacts}
      walletAddress={walletAddress}
      recentUserText={recentUserText}
      regenerate={
        showRegenerate
          ? {
              onRegenerate: () => onRegenerate?.(block.payload),
              isRegenerating:
                regeneratingAttemptIds?.has(block.payload.attemptId) ?? false,
            }
          : undefined
      }
    />
  );
}
