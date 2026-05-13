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
//
// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C10 follow-up (2026-05-13) — brand AudricMark for in-progress states
//
// The text crossfade alone (180ms) reads as static during long upstream
// gaps (gpt-image-1 sits on `confirming` for 30+ seconds — the founder's
// frog-image smoke surfaced "I dont see any animated anything lol"
// because the chip just sits showing "CONFIRMING" while OpenAI churns).
//
// Fix: render `<AudricMark size={14} animate />` (the diamond-grid
// favicon mark with the center-out pulse — same brand identity used by
// <ThinkingState> for pre-token thinking and <WorkingState> for the
// post-approve confirm-tier gap) to the LEFT of the label for the
// 4 in-progress states. The mark is omitted on the `done` terminal
// state (no longer "in progress" — the next mount will be the receipt).
//
// This unifies the brand-liveness signal across all three gap surfaces:
//   - Pre-token thinking    → <ThinkingState> + AudricMark
//   - Post-approve confirm  → <WorkingState> + AudricMark   (SPEC 23C C10)
//   - Auto-execute streaming → <TransitionChip> + AudricMark (this commit)
//
// Reduced-motion: AudricMark accepts `animate=false`, in which case the
// mark renders static. Brand identity preserved, no vestibular motion.
// ───────────────────────────────────────────────────────────────────────────

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AudricMark } from '@/components/ui/AudricMark';

export type TransitionState = 'routing' | 'quoting' | 'confirming' | 'settling' | 'done';

const COPY: Record<TransitionState, string> = {
  routing: 'ROUTING',
  quoting: 'QUOTE IN HAND',
  confirming: 'CONFIRMING',
  settling: 'SETTLING',
  done: 'DONE',
};

// Every state except `done` is "in progress" → render the animated brand
// mark next to the label. `done` is terminal so the mark would lie about
// activity; omit it.
const IN_PROGRESS_STATES: ReadonlySet<TransitionState> = new Set([
  'routing',
  'quoting',
  'confirming',
  'settling',
]);

interface TransitionChipProps {
  state: TransitionState;
}

export function TransitionChip({ state }: TransitionChipProps) {
  const label = COPY[state];
  const reduceMotion = useReducedMotion();
  const showMark = IN_PROGRESS_STATES.has(state);
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
          className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase text-fg-muted"
        >
          {showMark && (
            <AudricMark
              size={14}
              animate={reduceMotion !== true}
              className="text-fg-primary shrink-0"
            />
          )}
          <span>{label}</span>
        </motion.span>
      </AnimatePresence>
      <div className="flex-1 h-px bg-border-subtle" aria-hidden="true" />
    </div>
  );
}
