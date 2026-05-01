'use client';

import type { PermissionCardTimelineBlock, PendingAction } from '@/lib/engine-types';
import { PermissionCard, type DenyReason } from '../PermissionCard';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — PermissionCardBlockView (B2.2)
//
// Typed slot for the existing PermissionCard component. SPEC 7 v0.3.2
// will own the multi-step PermissionCard renderer (regenerate button,
// quote-age badge, multi-row layout) — this block exists in the timeline
// taxonomy so SPEC 7 has a chronologically positioned home for it.
//
// For B2.2 we delegate to the current PermissionCard unchanged — same
// recipient rendering, same approve/deny flow, just rendered inside the
// chronological timeline instead of the message-level static slot.
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
}

export function PermissionCardBlockView({
  block,
  onActionResolve,
  contacts,
  walletAddress,
  recentUserText,
}: PermissionCardBlockViewProps) {
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
