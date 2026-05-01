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
}

export function PermissionCardBlockView({
  block,
  onActionResolve,
  contacts,
  walletAddress,
  recentUserText,
  shouldAutoApprove,
}: PermissionCardBlockViewProps) {
  if (block.status !== 'pending') return null;
  if (shouldAutoApprove?.({ toolName: block.payload.toolName, input: block.payload.input })) {
    return null;
  }
  return (
    <PermissionCard
      action={block.payload}
      onResolve={onActionResolve}
      contacts={contacts}
      walletAddress={walletAddress}
      recentUserText={recentUserText}
    />
  );
}
