'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C7 — ReceiptChoreography primitive
//
// One-shot ~600ms pulse around a transaction receipt on first mount.
// Different tone per outcome:
//   - 'success' → accent (success-solid) ring pulse, signals "the
//                 thing landed and the on-chain tx settled"
//   - 'error'   → warning (warning-solid) ring pulse, signals "the
//                 service failed; the user needs to read the row"
//
// Why a tone signal AND a static check/warning glyph in the card body?
// The static glyph is the persistent receipt; the pulse is the moment-
// of-arrival cue. A receipt that just appears with no entrance signal
// reads as "ambient — nothing is asking for your attention." A pulse
// says "this just settled, look here." Subtle but it's the difference
// between "feels static" and "feels alive" in founder smoke.
//
// LAYERS WITH C1:
//   The outer MountAnimate (SPEC 23C C1) handles the card's entrance
//   (fade + slide + scale, ~220ms). ReceiptChoreography fires INSIDE
//   the card, animating boxShadow over ~600ms while the entrance is
//   running. The two animate different properties so they compose
//   without fighting; the visual result is "card slides in, then a
//   ring quickly pulses around it as it settles."
//
// IMPLEMENTATION:
//   Animates boxShadow as a 3-frame keyframe (transparent → visible
//   ring → transparent). Stays at the last keyframe (transparent) so
//   the card has no lingering decoration after the pulse completes.
//   The ring sits OUTSIDE the card border (positive shadow spread, no
//   inset) so it doesn't shift content or fight with the card's own
//   border-radius / border style.
//
//   600ms total: 0% → 30% expansion to peak ring (180ms), 30% → 100%
//   contraction back to transparent (420ms). Slower contraction makes
//   the pulse feel like a settling effect rather than a flash.
//
// REDUCED-MOTION:
//   Returns children unwrapped — no motion.div, no wrapper div, no
//   pulse. This preserves the exact existing layout for users with
//   prefers-reduced-motion: reduce. Satisfies SPEC 23C C8 by
//   construction; no separate audit needed.
//
// FIRES ONCE PER MOUNT:
//   The initial → animate transition is React-mount-keyed; once the
//   keyframes complete, no re-trigger happens unless the element
//   remounts. Receipts are stable in the timeline (they don't unmount
//   on streaming → settled transitions because the parent ToolBlockView
//   just swaps SkeletonCard ↔ ToolResultCard underneath), so the pulse
//   fires exactly when the user first sees the receipt.
// ───────────────────────────────────────────────────────────────────────────

interface ReceiptChoreographyProps {
  children: ReactNode;
  tone: 'success' | 'error';
}

export function ReceiptChoreography({ children, tone }: ReceiptChoreographyProps) {
  const reduceMotion = useReducedMotion();

  // Same wrapper structure in both branches (motion.div with rounded
  // corners) so consumers see a stable layout. The reduce-motion branch
  // skips the boxShadow keyframes — the wrapper exists but is animation-
  // less. Mirrors MountAnimate's two-branch pattern.
  //
  // Why always wrap: useReducedMotion() returns `null` on first render
  // (before the matchMedia useEffect resolves) and only flips to a
  // boolean after the first effect tick. If the wrapper were
  // conditional (fragment vs motion.div), a reduce-motion user would
  // see a layout flash on first render. Stable wrapper = stable layout.
  const ringColor =
    tone === 'success'
      ? 'rgba(34, 197, 94, 0.4)' // success-solid (green-500) at 40%
      : 'rgba(239, 68, 68, 0.4)'; // warning-solid (red-500) at 40%

  if (reduceMotion) {
    return (
      <div style={{ borderRadius: '0.5rem' }} data-receipt-choreography={`${tone}-reduced`}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ boxShadow: '0 0 0 0px rgba(0, 0, 0, 0)' }}
      animate={{
        boxShadow: [
          '0 0 0 0px rgba(0, 0, 0, 0)',
          `0 0 0 6px ${ringColor}`,
          '0 0 0 0px rgba(0, 0, 0, 0)',
        ],
      }}
      transition={{
        duration: 0.6,
        ease: 'easeOut',
        times: [0, 0.3, 1],
      }}
      style={{ borderRadius: '0.5rem' }}
      data-receipt-choreography={tone}
    >
      {children}
    </motion.div>
  );
}
