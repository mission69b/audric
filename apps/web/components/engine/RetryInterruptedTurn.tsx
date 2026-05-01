'use client';

import { useState } from 'react';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — Retry-interrupted-turn surface (audit Gap J)
//
// Rendered under any assistant message whose turn ended without a
// `turn_complete` event. Clicking the button re-submits the original
// user message via `onRetry(replayText)` — there is intentionally NO
// auto-retry to avoid duplicate writes when the interruption was
// caused by a guard / timeout the engine should have handled.
//
// Two visual states:
//   - idle: small inline pill with retry icon + "Response was interrupted"
//   - retrying: button disabled, "Retrying…" label so the user knows the
//     click was registered. The parent flips back to streaming UI as the
//     new turn opens, so we never have to reset this state ourselves.
//
// Style intentionally matches the muted-uppercase pill vocabulary used
// by `<AgentStep>` so it slots under a finished timeline / legacy
// content block without competing visually.
// ───────────────────────────────────────────────────────────────────────────

interface RetryInterruptedTurnProps {
  /** The original user message text to replay. */
  replayText: string;
  /** Engine consumer wires this to `engine.sendMessage`. Async so the
   *  pill can show a "Retrying…" placeholder while the request opens. */
  onRetry: (text: string) => void | Promise<void>;
  /** Disable the button when the engine is mid-turn (e.g. a previous
   *  retry already kicked off, or the user typed a new message). */
  disabled?: boolean;
}

export function RetryInterruptedTurn({
  replayText,
  onRetry,
  disabled,
}: RetryInterruptedTurnProps) {
  const [retrying, setRetrying] = useState(false);

  const handleClick = async () => {
    if (retrying || disabled) return;
    setRetrying(true);
    try {
      await onRetry(replayText);
    } finally {
      // Cleared as a defence-in-depth: under normal flow the engine
      // creates a new assistant message and this component unmounts
      // before this fires. If `onRetry` errors synchronously we still
      // want the user able to click again.
      setRetrying(false);
    }
  };

  const isDisabled = disabled || retrying;

  return (
    <div
      className="pl-1 mt-1.5"
      role="status"
      aria-label="Response was interrupted"
    >
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleClick}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] ' +
          'rounded-full border border-border-subtle bg-surface-muted/40 ' +
          'text-fg-muted hover:text-fg-primary hover:bg-surface-muted ' +
          'transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
        }
      >
        <RetryIcon />
        <span className="font-mono uppercase tracking-[0.05em]">
          {retrying ? 'Retrying…' : 'Response interrupted · retry'}
        </span>
      </button>
    </div>
  );
}

function RetryIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6a4 4 0 1 0 1.17-2.83" />
      <path d="M2 1.5V4h2.5" />
    </svg>
  );
}
