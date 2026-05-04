'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ExpectsConfirmPayload } from '@/lib/engine-types';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 15 Phase 2 — Confirm chips
//
// One-tap UX replacement for typing "Confirm" / "Cancel" after a multi-
// write Payment Stream plan. Chips POST to the same /api/engine/chat
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
// **[v0.4 — Refresh-on-expiry]** When the swap-quote `expiresAt` has
// passed and the parent wired `onRefresh`, we surface a third
// "Refresh quote" chip alongside the now-disabled Confirm/Cancel.
// Click → re-sends a literal "refresh quote" turn through normal
// `sendMessage`. The plan-context promotion (`priorWriteVerbs ≥ 1` +
// `PRIOR_PLAN_MARKER` match) deterministically promotes that turn to
// Sonnet, which sees the prior Payment Stream plan in context and
// re-runs swap_quote + prepare_bundle, surfacing fresh chips below.
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
  /**
   * [SPEC 15 Phase 2 v0.4 — Refresh-on-expiry] When the swap quote
   * expires AND the parent provides this callback, we render a
   * "Refresh quote" button that re-runs the prior plan with a fresh
   * quote (parent typically wires it to
   * `onSendMessage('refresh quote')` — plan-context promotion picks
   * up the prior assistant plan and re-runs swap_quote +
   * prepare_bundle). When omitted, the expired state shows the
   * legacy "ask for a fresh one" copy + the user must type
   * manually.
   *
   * Rendered only when `expired === true && !clicked && !disabled`
   * to avoid double-firing on a still-streaming Confirm/Cancel turn.
   */
  onRefresh?: () => void;
}

export function ConfirmChips({
  payload,
  onChipDecision,
  disabled = false,
  onRefresh,
}: ConfirmChipsProps) {
  // [Click latch] Once the user clicks either chip we lock the row so
  // a double-click can't fire two POSTs. The streaming response will
  // unmount this component (next assistant turn replaces it), so we
  // don't need to re-enable on success.
  const [clicked, setClicked] = useState<'yes' | 'no' | null>(null);

  // [Refresh-on-expiry click latch] Same one-shot guard as `clicked`,
  // scoped to the Refresh button. Once fired the parent's
  // `sendMessage` will start a new streaming turn which unmounts this
  // component on the next assistant message.
  const [refreshing, setRefreshing] = useState(false);

  // [Quote expiry countdown] Only meaningful when the bundle contains
  // a `swap_execute` step (server stamps `expiresAt` then). Re-renders
  // every second; once past expiry the chips lock + show "Quote
  // expired" so the user is steered to ask for a fresh quote.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!payload.expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [payload.expiresAt]);

  const expired = payload.expiresAt !== undefined && now >= payload.expiresAt;
  const secondsLeft =
    payload.expiresAt !== undefined
      ? Math.max(0, Math.ceil((payload.expiresAt - now) / 1000))
      : null;

  const isDisabled = disabled || clicked !== null || expired;

  // [Refresh-on-expiry] Show the Refresh chip ONLY when the quote has
  // truly expired AND no Confirm/Cancel turn is mid-flight — never
  // surface it as a co-equal third option pre-expiry. This keeps the
  // primary tap-to-confirm UX unambiguous and reserves Refresh as a
  // recovery affordance.
  const showRefreshChip = expired && !clicked && !disabled && !!onRefresh;

  const handleClick = (value: 'yes' | 'no') => {
    if (isDisabled) return;
    setClicked(value);
    onChipDecision({ value, forStashId: payload.stashId });
  };

  const handleRefresh = () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    onRefresh();
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
      {showRefreshChip ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            loading={refreshing}
            aria-label="Refresh the quote and prepare a new plan"
          >
            Refresh quote
          </Button>
          <span className="text-[11px] text-fg-muted font-mono uppercase tracking-[0.06em]">
            Quote expired
          </span>
        </>
      ) : expired ? (
        <span className="text-[11px] text-fg-muted font-mono uppercase tracking-[0.06em]">
          Quote expired — ask for a fresh one
        </span>
      ) : secondsLeft !== null && secondsLeft <= 10 ? (
        <span className="text-[11px] text-fg-muted font-mono uppercase tracking-[0.06em]">
          {secondsLeft}s left
        </span>
      ) : null}
    </div>
  );
}
