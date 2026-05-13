'use client';

import { AudricMark } from '@/components/ui/AudricMark';
import { Spinner } from '@/components/ui/Spinner';
import { TypingDots } from './motion/TypingDots';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C10 Step B / 2026-05-13 — wiring status + future-ready stubs
//
// Of the 8 declared statuses, 5 are wired today and 3 are future-ready
// stubs. Renaming or removing the stubs requires updating the design
// system reference (Agentic UI Figma) — the labels are part of the
// shared vocabulary even when the runtime hasn't wired them yet.
//
// WIRED:
//   awakening   → UnifiedTimeline connecting state (Spinner)
//   thinking    → ChatMessage pre-token TTFVP (AudricMark animate + TypingDots)
//   delivering  → TextBlockView inline at end of streaming text (AudricMark animate)
//   failed      → ChatMessage hard-fail state (`m.failed === true`)
//                 — AuthError + exhausted-retry connection error paths
//   interrupted → ChatMessage paired with <RetryInterruptedTurn>
//                 — `m.interrupted === true`
//
// FUTURE-READY (declared but no firing site):
//   priming     → Reserved for "post-approve, awaiting upstream service"
//                 semantic. Today <WorkingState> covers this gap with its
//                 own primary label, so wiring `priming` would duplicate
//                 the affordance. Revisit when WorkingState retires or
//                 when a non-PermissionCard surface needs the same
//                 semantic.
//   timed_out   → Reserved for explicit timeout detection. Today the
//                 60s-or-so abort path surfaces as a generic
//                 hasReceivedContent-aware error → either `interrupted`
//                 (with partial content) or `failed` (without). When
//                 useEngine grows a typed `m.timedOut?: boolean` flag
//                 backed by a real timeout signal (SLA breach, AbortError
//                 with `signal.reason === 'timeout'`, etc.), wire here.
//   queued      → Reserved for request queueing. No queueing
//                 infrastructure exists today — every send fires the SSE
//                 stream immediately. When a backpressure / rate-limit
//                 queue lands (e.g. SPEC X for cost-aware request
//                 throttling), wire here.
// ───────────────────────────────────────────────────────────────────────────

export type ThinkingStatus =
  | 'awakening'
  | 'thinking'
  | 'priming'
  | 'delivering'
  | 'interrupted'
  | 'failed'
  | 'timed_out'
  | 'queued';

export type ThinkingIntensity = 'active' | 'transitioning' | 'idle';

interface ThinkingStateProps {
  status: ThinkingStatus;
  intensity?: ThinkingIntensity;
}

const STATE_CONFIG: Record<ThinkingStatus, { icon: string; label: string }> = {
  awakening:   { icon: '✦', label: 'AWAKENING' },
  thinking:    { icon: '🧠', label: 'THINKING' },
  priming:     { icon: '⊞', label: 'PRIMING' },
  delivering:  { icon: '◈', label: 'DELIVERING' },
  interrupted: { icon: '⊘', label: 'INTERRUPTED' },
  failed:      { icon: '△', label: 'FAILED' },
  timed_out:   { icon: '⊙', label: 'TIMED OUT' },
  queued:      { icon: '≋', label: 'QUEUED' },
};

const INTENSITY_OPACITY: Record<ThinkingIntensity, string> = {
  active: 'opacity-100',
  transitioning: 'opacity-60',
  idle: 'opacity-30',
};

const ANIMATED_STATES = new Set<ThinkingStatus>(['thinking', 'priming', 'delivering', 'awakening']);

export function ThinkingState({ status, intensity = 'active' }: ThinkingStateProps) {
  const config = STATE_CONFIG[status];
  const opacityClass = INTENSITY_OPACITY[intensity];
  const isAnimated = ANIMATED_STATES.has(status);

  return (
    <div
      className={`inline-flex items-center gap-2 py-1.5 ${opacityClass} transition-opacity duration-300`}
      role="status"
      aria-label={config.label}
    >
      {isAnimated ? (
        status === 'awakening' || status === 'priming' ? (
          <Spinner size="sm" />
        ) : (
          <AudricMark size={16} animate className="text-fg-primary" />
        )
      ) : (
        <span className="text-sm leading-none" aria-hidden="true">
          {config.icon}
        </span>
      )}
      <span className="font-mono text-xs tracking-wider uppercase text-fg-muted">
        {config.label}
      </span>
      {/* SPEC 23C C5 — typing-dots wave during the LLM TTFVP gap.
       *  Scoped to status === 'thinking' (the "composing the reply"
       *  moment) — other states (priming, delivering, awakening, etc.)
       *  have their own semantic affordances and don't need dots on
       *  top. The wave reads as "actively typing" which is the right
       *  signal here; it's intentionally redundant with the AudricMark
       *  animation so the user has both identity and liveness signals
       *  during the TTFVP window. */}
      {status === 'thinking' && <TypingDots />}
    </div>
  );
}
