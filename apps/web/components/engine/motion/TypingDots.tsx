'use client';

import { motion, useReducedMotion } from 'framer-motion';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C5 — TypingDots primitive
//
// Three dots that pulse sequentially (●○○ → ○●○ → ○○● → ●○○ …) over a
// 1.4s cycle, with each dot's pulse offset 0.2s from the previous so
// the eye reads it as a left-to-right typing wave. Used inside
// <ThinkingState> during the LLM TTFVP (Time To First Visible Pixel)
// gap — the ~600-1500ms window between user-send and first stream
// event, when the agent has accepted the prompt but hasn't started
// emitting thinking / tool / text blocks yet.
//
// WHY ADD THIS WHEN <ThinkingState> ALREADY SHOWS A SPINNER:
//   ThinkingState's spinner / AudricMark says "the agent exists." The
//   typing-dots wave says "it's actively composing a response."
//   Together they cover two distinct "the system is working" affordances:
//     - identity (you're talking to Audric, not a generic spinner)
//     - liveness (it's mid-thought, not stalled)
//   Pre-C5 the user had only the identity signal during TTFVP, which
//   on slow connections (or after a cold-start) read as "is it stuck?"
//
// IMPLEMENTATION:
//   Three Framer Motion motion.spans, each animating opacity through
//   [0.2, 1, 0.2] over 1.4s with easeInOut. Per-dot delay = i * 0.2s
//   so the wave is visible. Infinite repeat — the dots keep pulsing
//   until ThinkingState unmounts (i.e. until the first stream event).
//
// REDUCED-MOTION:
//   Renders three static dots at 0.5 opacity (still distinguishable as
//   a typing affordance, just not animated). Same pattern used by every
//   other 23C primitive — visual presence preserved, motion suppressed.
//
// PLACEMENT:
//   Used by <ThinkingState> when status === 'thinking'. Other thinking
//   states (priming, delivering, etc.) keep their existing icon and
//   don't get dots — the dots are specific to the "I'm composing the
//   reply" moment, not "I'm spinning up" or "I'm sending it." Keep the
//   semantic narrow.
// ───────────────────────────────────────────────────────────────────────────

export function TypingDots() {
  const reduceMotion = useReducedMotion();

  // `reduceMotion !== false` pattern: useReducedMotion returns null on
  // first render (before matchMedia useEffect resolves), then flips to
  // true/false. We treat null AS reduce so reduce-motion users never
  // see a one-frame motion flash. Full-motion users get one frame of
  // static dots before the wave starts — imperceptible at 60fps.
  // Same conservative-default rationale as ReceiptChoreography.
  const animated = reduceMotion === false;

  if (!animated) {
    return (
      <span
        className="inline-flex items-center gap-0.5"
        role="status"
        aria-label="Composing response"
      >
        <span className="h-1 w-1 rounded-full bg-fg-muted/50" />
        <span className="h-1 w-1 rounded-full bg-fg-muted/50" />
        <span className="h-1 w-1 rounded-full bg-fg-muted/50" />
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="status"
      aria-label="Composing response"
      data-typing-dots="animated"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1 w-1 rounded-full bg-fg-muted"
          initial={{ opacity: 0.2 }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: 1.4,
            ease: 'easeInOut',
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </span>
  );
}
