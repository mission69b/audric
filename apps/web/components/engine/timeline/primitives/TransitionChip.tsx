'use client';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.1 — TransitionChip (streaming choreography)
//
// Animated single-chip primitive that crossfades through 5 states during a
// write turn:
//
//   routing     → LLM is fetching the swap route from the aggregator
//   quoting     → route in hand, quote card is about to render
//   confirming  → user tapped Confirm, client posting to /api/transactions/prepare
//   settling    → Enoki sponsored, awaiting waitForTransaction
//   done        → tx settled on-chain, receipt about to render
//
// `routing` and `quoting` are emitted by the engine via `withStreamState`
// in `@t2000/engine` (>= 1.26.0). `confirming` / `settling` / `done` are
// emitted by audric from `executeToolAction`'s sponsor flow.
//
// Per SPEC 21 D-1 (a) lock: typed enum, no `copyHint`. UI owns the copy.
// Per SPEC 21 D-2 (a) lock: Framer Motion for the crossfade.
//
// Visual language matches `<TaskInitiated />`: em-rule + monospace label
// + em-rule. The em-rules persist through state changes; only the text
// crossfades. This keeps the chip feeling like a single morphing object
// (the "stream like magic" goal) rather than a stack of discrete chips.
// ───────────────────────────────────────────────────────────────────────────

import { AnimatePresence, motion } from 'framer-motion';

export type TransitionState = 'routing' | 'quoting' | 'confirming' | 'settling' | 'done';

const COPY: Record<TransitionState, string> = {
  routing: 'ROUTING',
  quoting: 'QUOTE IN HAND',
  confirming: 'CONFIRMING',
  settling: 'SETTLING',
  done: 'DONE',
};

interface TransitionChipProps {
  state: TransitionState;
}

export function TransitionChip({ state }: TransitionChipProps) {
  const label = COPY[state];
  return (
    <div
      className="flex items-center gap-3 my-1.5"
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="transition-chip"
      data-state={state}
    >
      <div className="flex-1 h-px bg-border-subtle" aria-hidden="true" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-fg-muted"
        >
          {label}
        </motion.span>
      </AnimatePresence>
      <div className="flex-1 h-px bg-border-subtle" aria-hidden="true" />
    </div>
  );
}
