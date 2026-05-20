"use client";

/**
 * TypingDots — sequential 3-dot pulse, used inside `<ThinkingState />`
 * during the LLM TTFVP (Time To First Visible Pixel) gap.
 *
 * Ported from `apps/web/components/engine/motion/TypingDots.tsx`
 * verbatim (S.204+ Phase 6.7). Three Framer Motion spans pulsing
 * sequentially over a 1.4s cycle with 0.2s per-dot offset → reads
 * as a left-to-right typing wave.
 *
 * Reduced motion: 3 static dots at 0.5 opacity (still recognizable
 * as a typing affordance, just not animated). Same WCAG 2.3.3
 * pattern used by every motion primitive in the design system.
 */

import { motion, useReducedMotion } from "framer-motion";

export function TypingDots() {
  const reduceMotion = useReducedMotion();
  // null on first render (before matchMedia resolves) → treat as
  // "reduce" so reduce-motion users never see a one-frame flash.
  const animated = reduceMotion === false;

  if (!animated) {
    return (
      <span
        aria-label="Composing response"
        className="inline-flex items-center gap-0.5"
        role="status"
      >
        <span className="h-1 w-1 rounded-full bg-fg-muted/50" />
        <span className="h-1 w-1 rounded-full bg-fg-muted/50" />
        <span className="h-1 w-1 rounded-full bg-fg-muted/50" />
      </span>
    );
  }

  return (
    <span
      aria-label="Composing response"
      className="inline-flex items-center gap-0.5"
      data-typing-dots="animated"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          animate={{ opacity: [0.2, 1, 0.2] }}
          className="h-1 w-1 rounded-full bg-fg-muted"
          initial={{ opacity: 0.2 }}
          key={i}
          transition={{
            duration: 1.4,
            ease: "easeInOut",
            repeat: Number.POSITIVE_INFINITY,
            delay: i * 0.2,
          }}
        />
      ))}
    </span>
  );
}
