'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C1 — MountAnimate primitive
//
// Wraps any rendered block / card / cluster cell with a one-shot mount
// animation: fade + slide-up + (subtle) scale. Single primitive used
// across ReasoningTimeline (per-block), MppReceiptGrid (per-cell), and
// ParallelToolsGroup (per-card) so the entire chat surface speaks the
// same motion vocabulary.
//
// THREE INPUTS DRIVE THE FEEL:
//
//   1. `intensity` — 'full' (default) or 'subtle'.
//      - 'full'   = y-slide 8px + scale 0.98→1 + 220ms duration
//      - 'subtle' = y-slide 4px + no scale + 160ms duration
//      Subtle is reserved for engine-injected post-write refreshes
//      (block.source === 'pwr') so they read as ambient bookkeeping
//      ("the agent is keeping its state fresh") rather than deliberate
//      user-perceived actions. LLM- and user-driven dispatches use 'full'.
//
//   2. `staggerIndex` — 0-based position within a sibling cluster.
//      Each unit adds 30ms delay so siblings cascade rather than slamming
//      in together. Spec target: ~30ms intra-cluster, ~80ms inter-block.
//      The 80ms inter-block cadence is implicit — sibling clusters mount
//      from React's natural flush ordering and the 220ms full duration
//      gives each block its own visual beat. Pass staggerIndex only when
//      multiple siblings are KNOWN to mount simultaneously (parallel
//      group cells, regen-cluster grid cells).
//
//   3. `useReducedMotion()` — automatic from Framer Motion. Returns
//      true when the OS / browser advertises `prefers-reduced-motion:
//      reduce`. In that mode every variant collapses to opacity-only
//      with a 0ms duration (instant) — this satisfies the SPEC 23C C8
//      reduced-motion bar by construction and keeps test environments
//      using the vitest.setup.ts matchMedia mock from hanging on
//      animation frames jsdom never advances.
//
// TIMING TUNING NOTES:
//
//   The 220ms / 160ms durations were chosen so that a ~3-card parallel
//   cluster (4 stagger steps × 30ms = 120ms total stagger + 220ms tail)
//   completes within ~340ms — fast enough to feel responsive on the next
//   user action, slow enough that the eye registers the cascade. Going
//   below 180ms makes the motion feel like a flicker; going above 280ms
//   stretches into "the UI is slow" territory.
//
//   The 30ms intra-cluster stagger is the smallest interval the human
//   eye reliably registers as sequential rather than simultaneous (per
//   Material Motion guidelines). 50ms+ feels deliberate and slow for
//   tightly-coupled siblings.
//
// USAGE:
//
//   <MountAnimate>
//     <ToolBlockView block={block} />
//   </MountAnimate>
//
//   <MountAnimate intensity="subtle">
//     <PwrRefreshCard ... />
//   </MountAnimate>
//
//   {cells.map((cell, i) => (
//     <MountAnimate key={cell.id} staggerIndex={i}>
//       <Cell {...cell} />
//     </MountAnimate>
//   ))}
//
// WHEN NOT TO USE:
//
//   - Inside another <MountAnimate>. Double-wrapping multiplies the
//     fade-in and looks broken.
//   - For elements that update in-place (e.g. a counter increment).
//     Use <NumberTicker> (SPEC 23C C3) for value transitions.
//   - For canvas/modal entrance animations. Those have their own
//     primitives (modal motion lives with the modal component).
// ───────────────────────────────────────────────────────────────────────────

interface MountAnimateProps {
  children: ReactNode;
  intensity?: 'full' | 'subtle';
  staggerIndex?: number;
  /** Optional className passed to the wrapping motion.div. Most callers
   *  don't need this — only set it when the wrapper itself participates
   *  in CSS layout (e.g. needs to be a grid cell). */
  className?: string;
}

const STAGGER_STEP_MS = 30;

export function MountAnimate({
  children,
  intensity = 'full',
  staggerIndex = 0,
  className,
}: MountAnimateProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    // Opacity-only, instant — satisfies prefers-reduced-motion without
    // breaking visual continuity. The fade-in is gone but the layout
    // is identical to the animated path.
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0 }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  const subtle = intensity === 'subtle';
  const initial = subtle
    ? { opacity: 0, y: 4 }
    : { opacity: 0, y: 8, scale: 0.98 };
  const animate = subtle
    ? { opacity: 1, y: 0 }
    : { opacity: 1, y: 0, scale: 1 };
  const duration = subtle ? 0.16 : 0.22;
  const delay = (staggerIndex * STAGGER_STEP_MS) / 1000;

  return (
    <motion.div
      initial={initial}
      animate={animate}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
