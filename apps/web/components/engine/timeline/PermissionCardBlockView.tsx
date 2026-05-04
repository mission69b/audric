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
   *
   * [F14-fix-2 / 2026-05-03] MUST include `steps` for bundle correctness.
   * `shouldClientAutoApprove` only iterates bundle legs when
   * `Array.isArray(action.steps) && action.steps.length >= 2`. Stripping
   * `steps` at this callsite (the original Bug A shape) silently
   * downgrades the gate to single-step (step[0]-only) logic, which hides
   * the card for bundles whose first leg is auto-tier even when later
   * legs require confirmation. Always pass the full payload.
   */
  shouldAutoApprove?: (
    action: Pick<PendingAction, 'toolName' | 'input' | 'steps'>,
  ) => boolean;
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
  // [F14-fix-2] Pass the full PendingAction payload (including `steps`)
  // so the bundle iteration in `shouldClientAutoApprove` actually runs.
  // The original implementation cherry-picked `{toolName, input}` which
  // stripped `steps` and silently re-introduced the Bug A pattern in the
  // render path: a bundle whose step[0] was auto-tier (e.g. `repay $2`)
  // would have its card hidden even when step[5] was a `borrow`
  // (always-confirm). The auto-approve `useEffect` in `UnifiedTimeline`
  // gets the full action and resolves correctly to `confirm`, so the
  // bundle ends up neither auto-approved nor card-rendered — stuck in
  // pending state forever. See `permission-tiers-client.ts`'s F14 block
  // and the regression test `bundle render-path callsite preserves steps`.
  if (shouldAutoApprove?.(block.payload)) {
    return null;
  }
  // [SPEC 7 P2.4b] Only wire the regenerate slot when the engine flagged
  // the bundle as refreshable AND the host gave us a handler. Single-step
  // actions get a regenerate slot when the engine populated
  // `canRegenerate` + `regenerateInput` AND the host wired a callback.
  // [SPEC 15 v0.7 follow-up — single-write regenerate, 2026-05-04]
  // Pre-v0.7 also gated on `isBundle` (steps.length >= 2). Lifted
  // because `@t2000/engine` ≥1.16.0 now populates `canRegenerate`
  // on single-write confirm-tier actions whose composition
  // consumed a same-turn regeneratable read (e.g. a $50
  // swap_execute that referenced a prior `swap_quote`). Same shape
  // change applied in `LegacyReasoningRender.tsx`.
  const showRegenerate = Boolean(
    onRegenerate &&
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
