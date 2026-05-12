'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C3 — NumberTicker primitive
//
// Renders a numeric value with optional count-up tween between value
// changes. Used to give balance / health-factor / APY readouts a
// "settle into place" feel when the value updates instead of slamming
// the new number into the DOM.
//
// FIRST-MOUNT BEHAVIOR (intentional):
//   On first mount, the displayed text is the FORMATTED TARGET VALUE
//   immediately — no count-up from zero. Why:
//     1. Audric's chat architecture mounts cards fresh per turn (every
//        balance_check creates a new BalanceCard instance). Animating
//        from 0 → value on every mount would mean every balance check
//        the user sees ticks up from $0, which gets old fast and
//        conflicts with the user's mental model ("my balance was
//        already $1,234, why is it ticking up from $0?").
//     2. C1's MountAnimate already gives the card a satisfying
//        entrance (fade + slide + scale, ~220ms). Adding a count-up
//        tween on top would fight for the eye's attention with the
//        card-level motion.
//     3. SSR / first-paint correctness: the rendered text matches the
//        formatted target on the very first render, so server-rendered
//        HTML is identical to client-hydrated HTML. No hydration
//        mismatch.
//
// SUBSEQUENT VALUE CHANGES (the actual count-up moment):
//   When the `value` prop changes after first mount, the component
//   tweens from the previous value to the new one over `durationMs`
//   (default 400ms ease-out). This is when the count-up feel matters:
//   the user sees their balance go from $1,200 to $1,250 after a swap,
//   not flash-replace.
//
// API:
//   <NumberTicker value={1234.56} format={(n) => `$${n.toFixed(2)}`} />
//
//   value         — the target numeric value
//   format        — function from animated number to display string.
//                   Called every motion-frame (~60fps), so keep it
//                   cheap. fmtUsd from cards/primitives.ts is fine.
//   durationMs    — tween length on value changes, defaults to 400.
//
// REDUCED-MOTION:
//   Skips the tween entirely on value changes. Always renders the
//   target. Same behavior as first-mount; net effect is: no animation
//   ever fires for users with prefers-reduced-motion: reduce.
//
// HOW THIS LAYERS WITH C1 + C7:
//   - C1's MountAnimate handles the card's entrance (fade + slide +
//     scale, ~220ms).
//   - C7's ReceiptChoreography handles the receipt's tone signal
//     (boxShadow ring pulse, ~600ms).
//   - C3's NumberTicker handles in-place value transitions (~400ms).
//   The three primitives animate different DOM properties so they
//   compose without fighting; their durations are tuned so each
//   has its own visual beat.
// ───────────────────────────────────────────────────────────────────────────

interface NumberTickerProps {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  /** Optional className passed to the wrapping span. Set this to style
   *  the rendered number (mono font, color, weight). */
  className?: string;
}

export function NumberTicker({
  value,
  format,
  durationMs = 400,
  className,
}: NumberTickerProps) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const formatRef = useRef(format);
  formatRef.current = format;

  // Initial state = formatted target value (no count-up on first mount).
  // See the first-mount JSDoc rationale at the top of this file.
  const [displayed, setDisplayed] = useState(() => format(value));

  // Track whether this is the first effect run so we can skip the tween
  // on initial mount (the value didn't "change" — it just appeared).
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      // First mount — the displayed value already matches the target
      // from useState's initial value. Nothing to animate.
      return;
    }
    if (reduceMotion) {
      // Subsequent value change with reduced motion — snap to target.
      setDisplayed(formatRef.current(value));
      return;
    }
    // Subsequent value change with full motion — tween from current
    // motion value to the new target. The motion value's current
    // position is the previous `value` (it was set there by the prior
    // animate() completion or by useState's initial value).
    const controls = animate(motionValue, value, {
      duration: durationMs / 1000,
      ease: 'easeOut',
    });
    const unsubscribe = motionValue.on('change', (latest) => {
      setDisplayed(formatRef.current(latest));
    });
    return () => {
      controls.stop();
      unsubscribe();
    };
    // motionValue is stable (useMotionValue returns the same instance
    // across renders); excluding it from the dep array per Framer
    // Motion's intended pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs, reduceMotion]);

  return <span className={className}>{displayed}</span>;
}
