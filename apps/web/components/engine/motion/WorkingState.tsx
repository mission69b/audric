'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AudricMark } from '@/components/ui/AudricMark';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C10 — WorkingState primitive
//
// Replaces SPEC 23C C6's <ApprovingIndicator> as the post-approve
// "we're working on it" affordance on PermissionCard. Same mount
// timing (renders the moment the user taps Approve, unmounts when
// the parent timeline block flips status), but with a richer signal
// that fits the long-tail upstream gaps the previous indicator
// couldn't cover.
//
// THE INCIDENT THAT MOTIVATED THIS:
//   2026-05-13 — gpt-image-1 image gen request. End-to-end timeline
//   was correct (~62s total), but ~38 seconds of that was the
//   OpenAI vendor gap between "payment confirmed on-chain" and
//   "image returned + uploaded to Blob". During those 38 seconds the
//   user saw a 16px generic Spinner + "Approving…" text and nothing
//   else. Founder's instinct: "no thinking or feedback to show its
//   working" — accurate. The brand AudricMark animation that lives
//   in <ThinkingState> for pre-token thinking was nowhere to be seen
//   in this gap.
//
// WHAT CHANGED FROM ApprovingIndicator:
//   1) Brand mark — <AudricMark animate /> (the diamond-grid
//      favicon with the center-out pulse) replaces the generic
//      <Spinner />. Same identity signal the user sees during
//      pre-token thinking, now extended into the post-approve gap.
//
//   2) Phase-aware sub-label — A second smaller line under the
//      primary label that cycles through tool-aware phases:
//        0–3s:    "Confirming on-chain…"
//        3–25s:   tool-specific (e.g. "Working with vendor…",
//                 "Routing through DEXes…", "Depositing to NAVI…")
//        25s+:    "Almost done…"
//      The thresholds are deliberately conservative — the sponsored
//      tx flow is ~2s, the long tail is the upstream service work,
//      so we don't switch off "Confirming…" until 3s have elapsed.
//
//   3) Per-tool phase defaults — `toolName` prop drives the lookup
//      so swap_execute reads "Routing through DEXes…" instead of a
//      generic "Working…". Caller can fully override via `phases`.
//
// WHY NOT JUST WIDEN <ApprovingIndicator>:
//   The semantic meaning differs. ApprovingIndicator was the
//   "click landed" affordance — a 1–2s gap before the card
//   unmounts. WorkingState is the "we're processing this for as
//   long as it takes" affordance — could be 3s, could be 60s.
//   Naming matters: callers shouldn't pass `label="Approving…"`
//   for a flow that's actually been past "approving" for 30 seconds.
//
// LAYERS WITH OTHER C-PRIMITIVES:
//   - C1 MountAnimate → card entrance
//   - C5 TypingDots   → pre-token TTFVP
//   - C6 (deprecated, replaced by this)
//   - C7 ReceiptChoreography → fires AFTER WorkingState unmounts
//   The full UX flow now: button click → WorkingState (this, with
//   phase-cycling sub-label) → parent unmount → receipt mount with
//   ReceiptChoreography pulse.
//
// REDUCED-MOTION:
//   Honored via framer-motion's useReducedMotion(). When reduced:
//     - AudricMark renders static (animate={false}). Brand identity
//       is preserved but the pulse stops.
//     - Sub-label still cycles (text update is below the motion
//       threshold; users with reduced-motion preferences want
//       progress signals, just not vestibular motion).
//
// NO FADE TRANSITION ON SUB-LABEL SWAP (deliberate):
//   The sub-label changes at most twice in a normal flow (3s and
//   25s thresholds). A snap transition is honest about the discrete
//   step and avoids the AnimatePresence/mode="wait" complexity that
//   tangles with fake timers in jsdom. If you ever want a fade,
//   prefer a plain CSS keyframe over Framer's AnimatePresence —
//   the simpler primitive avoids the test-isolation cost.
// ───────────────────────────────────────────────────────────────────────────

export type ToolPhaseKey =
  | 'pay_api'
  | 'swap_execute'
  | 'save_deposit'
  | 'withdraw'
  | 'borrow'
  | 'repay_debt'
  | 'send_transfer'
  | 'claim_rewards'
  | 'harvest_rewards'
  | 'volo_stake'
  | 'volo_unstake';

const DEFAULT_PHASES: Record<string, [string, string, string]> = {
  pay_api: ['Confirming on-chain…', 'Working with vendor…', 'Almost done…'],
  swap_execute: ['Confirming on-chain…', 'Routing through DEXes…', 'Settling…'],
  save_deposit: ['Confirming on-chain…', 'Depositing to NAVI…', 'Settling…'],
  withdraw: ['Confirming on-chain…', 'Withdrawing from NAVI…', 'Settling…'],
  borrow: ['Confirming on-chain…', 'Drawing from NAVI…', 'Settling…'],
  repay_debt: ['Confirming on-chain…', 'Repaying NAVI…', 'Settling…'],
  send_transfer: ['Confirming on-chain…', 'Sending…', 'Settling…'],
  claim_rewards: ['Confirming on-chain…', 'Claiming rewards…', 'Settling…'],
  harvest_rewards: ['Confirming on-chain…', 'Compounding…', 'Settling…'],
  volo_stake: ['Confirming on-chain…', 'Staking…', 'Settling…'],
  volo_unstake: ['Confirming on-chain…', 'Unstaking…', 'Settling…'],
};

export const FALLBACK_PHASES: [string, string, string] = [
  'Confirming on-chain…',
  'Working…',
  'Almost done…',
];

// Phase 0 always shows immediately. Phase 1 fires at 3s (covers the
// fast sponsored-tx path), phase 2 at 25s (only seen for actually-
// long upstream gaps like image gen).
const PHASE_TRANSITIONS_MS: [number, number] = [3000, 25000];

export function resolvePhases(
  toolName: string | undefined,
  override?: readonly string[],
): readonly string[] {
  if (override && override.length > 0) return override;
  if (!toolName) return FALLBACK_PHASES;
  return DEFAULT_PHASES[toolName] ?? FALLBACK_PHASES;
}

interface WorkingStateProps {
  /**
   * Primary label. Defaults to "WORKING". Stays constant while the
   * sub-label cycles through phases — this gives the user a stable
   * brand-state identifier alongside the changing detail.
   */
  label?: string;
  /**
   * Tool name driving the default phase set. Pass `action.toolName`
   * from PermissionCard. Unknown tool names fall back to the generic
   * FALLBACK_PHASES — no need to gate the prop.
   */
  toolName?: string;
  /**
   * Override the phase sequence entirely. Use this for non-tool
   * contexts (e.g. the bundle path where a single tool name doesn't
   * represent the whole flow).
   */
  phases?: readonly string[];
  /**
   * Override the phase transition timings (ms). Two values:
   * `[firstTransitionMs, secondTransitionMs]`. Defaults to `[3000, 25000]`.
   * Tests pass smaller values to avoid waiting in fake-timer setups.
   */
  transitionsMs?: readonly [number, number];
  className?: string;
}

export function WorkingState({
  label = 'WORKING',
  toolName,
  phases: phasesOverride,
  transitionsMs = PHASE_TRANSITIONS_MS,
  className,
}: WorkingStateProps) {
  const reduceMotion = useReducedMotion();
  const phases = resolvePhases(toolName, phasesOverride);
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (phases.length <= 1) return;
    const t1 = setTimeout(() => setPhaseIndex(1), transitionsMs[0]);
    if (phases.length <= 2) return () => clearTimeout(t1);
    const t2 = setTimeout(() => setPhaseIndex(2), transitionsMs[1]);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phases.length, transitionsMs]);

  const currentPhase = phases[Math.min(phaseIndex, phases.length - 1)];

  return (
    <div className={cn(className)} data-working-state>
      <div className="inline-flex items-center gap-2.5 py-1 text-left">
        <AudricMark
          size={20}
          animate={reduceMotion !== true}
          className="text-fg-primary shrink-0"
        />
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-xs tracking-wider uppercase text-fg-primary">
            {label}
          </span>
          {currentPhase && (
            <span
              key={currentPhase}
              className="text-[10px] text-fg-secondary mt-0.5"
              data-phase-index={phaseIndex}
            >
              {currentPhase}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
