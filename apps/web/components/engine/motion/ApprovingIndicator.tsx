'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Spinner } from '@/components/ui/Spinner';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C6 — ApprovingIndicator primitive
//
// The post-click "Approving…" affordance on PermissionCard. Replaces
// the pre-C6 plain text with a spinner + label that fades in over
// ~150ms, signalling "click landed, working on it" between the user's
// approval click and the moment the parent timeline block flips
// status (causing the entire card to unmount).
//
// WHY THIS LIVES IN A PRIMITIVE INSTEAD OF INLINE:
//   PermissionCard has TWO render branches with the same "Approving…"
//   indicator (the multi-write bundle path and the single-write path).
//   Inlining the spinner + label + cross-fade twice would invite drift
//   ("the bundle path uses motion.span, the single-write uses div, why
//   are they different…"). Centralising into one primitive keeps the
//   visual identical across both surfaces.
//
//   The primitive is intentionally NOT an "ApproveButton" — by the
//   time PermissionCard renders this indicator, the original Approve
//   button is already gone (the `resolved` state swap unmounts it).
//   The full label → spinner → checkmark micro-interaction described
//   in the C6 spec would require keeping the button mounted longer
//   (a separate `approving-state` render branch in PermissionCard
//   between `pending` and `approved`). Deferred — the click-to-spinner
//   transition is the highest-leverage win; the checkmark phase is
//   marginal polish on top.
//
// LAYERS WITH OTHER C-PRIMITIVES:
//   - C1 MountAnimate handles the card's entrance — ApprovingIndicator
//     fires on click, never on mount.
//   - C7 ReceiptChoreography fires on receipt mount AFTER the engine
//     responds — this indicator covers the gap BEFORE that response.
//   The full UX flow: button click → ApprovingIndicator (this) →
//   parent unmount → receipt mount with ReceiptChoreography pulse.
//
// REDUCED-MOTION:
//   No motion wrapping. Renders the spinner + label statically (the
//   spinner itself is a CSS animation in the Spinner component which
//   already respects motion-reduce via its own classes).
// ───────────────────────────────────────────────────────────────────────────

interface ApprovingIndicatorProps {
  /** Label shown next to the spinner. Defaults to "Approving…" but
   *  consumers can override (e.g. "Confirming…" for non-approve flows). */
  label?: string;
  className?: string;
}

export function ApprovingIndicator({
  label = 'Approving…',
  className,
}: ApprovingIndicatorProps) {
  const reduceMotion = useReducedMotion();

  // Same content in both branches; only the entrance fade differs.
  const content = (
    <span className="inline-flex items-center justify-center gap-2 text-xs text-fg-secondary py-1">
      <Spinner size="sm" />
      <span>{label}</span>
    </span>
  );

  if (reduceMotion === true) {
    return <div className={className}>{content}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      data-approving-indicator
    >
      {content}
    </motion.div>
  );
}
