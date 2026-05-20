"use client";

/**
 * ThinkingState — derives its label/icon purely from AI SDK's
 * `status` field. Pure Vercel-AI-pattern implementation (per
 * S.204+ Phase 6.7 lock — `harness_state_machine = ai_sdk_status`).
 *
 * Why this is much simpler than v1's `ThinkingState.tsx` (117 LoC):
 * v1 has an 8-state vocabulary (awakening / thinking / priming /
 * delivering / interrupted / failed / timed_out / queued) tied to
 * the legacy `useEngine` event surface. v2 uses AI SDK v6's
 * `useChat`, where `status` is one of:
 *   - "submitted"  → request sent, awaiting first event   → AWAKENING
 *   - "streaming"  → events arriving                       → THINKING / DELIVERING
 *   - "ready"      → idle (don't render)
 *   - "error"      → server-side error (handled elsewhere)
 *
 * THINKING vs DELIVERING distinction: derived from whether the
 * trailing message has emitted any `text` part yet. Pre-text =
 * "still composing" (AudricMark animate + typing dots), post-text =
 * "actively streaming the answer" (AudricMark animate, no dots —
 * the streaming text itself is the liveness signal).
 *
 * This component is meant to be rendered inside the `<Message>`
 * block of the trailing assistant message during streaming. Mount
 * it OUTSIDE the message timeline and the auto-stick-to-bottom
 * scrolling won't keep it in view.
 */

import type { ChatStatus } from "ai";
import { TypingDots } from "@/components/audric/typing-dots";
import { AudricMark } from "@/components/ui/audric-mark";
import { Spinner } from "@/components/ui/spinner";

interface ThinkingStateProps {
  /** Has the trailing assistant message emitted text yet? */
  hasText: boolean;
  /** AI SDK status. `useChat()` returns this verbatim. */
  status: ChatStatus;
}

export function ThinkingState({ status, hasText }: ThinkingStateProps) {
  // Don't render in idle / error / submitted-late states.
  // "submitted" + "streaming" are the only on-the-wire states.
  if (status !== "submitted" && status !== "streaming") {
    return null;
  }

  const isAwakening = status === "submitted";
  // `isDelivering` (streaming + text emitted) isn't a separate visual
  // state today — once text streams, we unmount the thinking badge
  // entirely so the streaming text is the only liveness signal. Kept
  // implicit in the if/else chain below.
  const isThinking = status === "streaming" && !hasText;

  let label: string;
  if (isAwakening) {
    label = "AWAKENING";
  } else if (isThinking) {
    label = "THINKING";
  } else {
    label = "DELIVERING";
  }

  let indicator: React.ReactNode;
  if (isAwakening) {
    indicator = <Spinner size="sm" />;
  } else {
    indicator = <AudricMark animate className="text-fg-primary" size={16} />;
  }

  return (
    <div
      aria-label={label}
      className="inline-flex items-center gap-2 py-1.5 transition-opacity duration-300"
      role="status"
    >
      {indicator}
      <span className="font-mono text-xs text-fg-muted uppercase tracking-wider">
        {label}
      </span>
      {isThinking && <TypingDots />}
    </div>
  );
}
