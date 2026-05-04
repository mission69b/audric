'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ExpectsConfirmPayload } from '@/lib/engine-types';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 15 Phase 2 — Confirm chips
//
// One-tap UX replacement for typing "Confirm" / "Cancel" after a multi-
// write Payment Intent plan. Chips POST to the same /api/engine/chat
// endpoint with `chipDecision: { via: 'chip', value: 'yes' | 'no',
// forStashId }` — the chat route's chip-routing block (commit 1)
// short-circuits the LLM:
//   - value='yes' + matching stashId → fast-path dispatch (~17ms)
//   - value='yes' + mismatched stashId → falls through to text-confirm
//   - value='no' → deletes stash + synthesizes "Cancelled by user" turn
//
// **Wire-format contract (commit 1's documented requirement):** when
// the user clicks Confirm, the message text MUST match CONFIRM_PATTERN
// so a stale-stash mismatch falls through cleanly. We send literal
// "Confirm" / "Cancel" strings to honor that.
//
// **[v0.7 — Refresh chip removed, 2026-05-04]** A "Refresh quote"
// chip lived here in v0.4–v0.6 and produced three production gaps in
// 24h: literal "refresh quote" text was read as quote-only; replaying
// the original intent caused Sonnet to auto-execute auto-tier bundles
// without re-confirmation. The chip's only unique value was "save 1
// retype on auto-tier multi-write bundle expiry" — too small a UX
// win for the ongoing Sonnet-interpretation fragility. PermissionCard
// regenerate (server-side, deterministic) covers every other expiry
// scenario. On chip expiry the user types the request again. See
// `SPEC_15_PHASE2_DESIGN.md` v0.7.
// ───────────────────────────────────────────────────────────────────────────

interface ConfirmChipsProps {
  payload: ExpectsConfirmPayload;
  onChipDecision: (decision: { value: 'yes' | 'no'; forStashId: string }) => void;
  /**
   * Forced disabled state — set by the parent when the chip's stash
   * has already been consumed (e.g. another tab clicked first, or the
   * user already typed a text confirm). Independent of the
   * `expiresAt` countdown which we own internally.
   */
  disabled?: boolean;
}

export function ConfirmChips({
  payload,
  onChipDecision,
  disabled = false,
}: ConfirmChipsProps) {
  // [Click latch] Once the user clicks either chip we lock the row so
  // a double-click can't fire two POSTs. The streaming response will
  // unmount this component (next assistant turn replaces it), so we
  // don't need to re-enable on success.
  const [clicked, setClicked] = useState<'yes' | 'no' | null>(null);

  // [Quote expiry countdown] Only meaningful when the bundle contains
  // a `swap_execute` step (server stamps `expiresAt` then). Re-renders
  // every second; once past expiry the chips lock + show "Quote
  // expired — ask for a fresh one" so the user types the request again.
  //
  // [SPEC 15 v0.7 follow-up smoke test, 2026-05-04] Stop ticking once
  // a chip has been clicked OR a parent-forced `disabled` is set. The
  // post-click state is permanent (the chips component will unmount
  // when the next assistant turn streams in), so continuing the
  // interval past `clicked !== null` could only do harm — it could
  // cross `expiresAt` mid-stream and swap the loading state ("Confirm"
  // spinner) for a misleading "Quote expired — ask for a fresh one"
  // banner next to the actual PermissionCard the user just dispatched.
  // Gate both the `expired` check + the rendered banner on
  // `clicked === null` so the post-click row is always
  // `[Confirm spinner] [Cancel disabled]` until unmount.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!payload.expiresAt) return;
    if (clicked !== null) return;
    if (disabled) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [payload.expiresAt, clicked, disabled]);

  const expired =
    clicked === null &&
    !disabled &&
    payload.expiresAt !== undefined &&
    now >= payload.expiresAt;
  const secondsLeft =
    payload.expiresAt !== undefined
      ? Math.max(0, Math.ceil((payload.expiresAt - now) / 1000))
      : null;

  const isDisabled = disabled || clicked !== null || expired;

  const handleClick = (value: 'yes' | 'no') => {
    if (isDisabled) return;
    setClicked(value);
    onChipDecision({ value, forStashId: payload.stashId });
  };

  return (
    <div
      className="flex items-center gap-2 pl-1 pt-1"
      role="group"
      aria-label="Confirm or cancel the proposed plan"
    >
      <Button
        variant="primary"
        size="sm"
        onClick={() => handleClick('yes')}
        disabled={isDisabled}
        loading={clicked === 'yes'}
        aria-label="Confirm the proposed plan"
      >
        Confirm
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => handleClick('no')}
        disabled={isDisabled}
        loading={clicked === 'no'}
        aria-label="Cancel the proposed plan"
      >
        Cancel
      </Button>
      {clicked === null && !disabled && expired ? (
        <span className="text-[11px] text-fg-muted font-mono uppercase tracking-[0.06em]">
          Quote expired — ask for a fresh one
        </span>
      ) : clicked === null && !disabled && secondsLeft !== null && secondsLeft <= 10 ? (
        <span className="text-[11px] text-fg-muted font-mono uppercase tracking-[0.06em]">
          {secondsLeft}s left
        </span>
      ) : null}
    </div>
  );
}
