'use client';

import { useState } from 'react';
import { fmtMppPrice } from './chrome';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-MPP6 — ReviewCard primitive
//
// v2 (B-MPP6-fastpath / 2026-05-12) — 2-button (Regenerate + Cancel),
// fastpath-aware, with inline error-chip recovery.
//
// Rendered below previewable content-gen MPP results (DALL-E images today,
// ElevenLabs TTS today; PDFShift skipped — deprecating to fallback per
// `spec_native_content_tools` HANDOFF §5; Lob/Resend skipped — terminal,
// no regen possible).
//
// Two buttons:
//
//   • Regenerate — when `onRegenerate` is provided (fastpath path), fires
//                  the async client-driven re-dispatch via `executeToolAction.pay_api`,
//                  bypassing the LLM round-trip. Latches to "Regenerating…"
//                  while in-flight. On success, the new tool block appears
//                  in the timeline above (the latch stays — this card is
//                  done). On failure, the latch resets and an inline error
//                  chip shows "Regen failed — Try again".
//                  When `onRegenerate` is NOT provided (legacy Option C
//                  fallback), fires `onSendMessage("Regenerate the {noun}")`
//                  for an LLM round-trip. Provided as a graceful degradation
//                  path; production should always wire `onRegenerate`.
//
//   • Cancel    — fires `onSendMessage("Cancel — discard this {noun}...")`
//                 so the LLM acknowledges + doesn't carry the preview into
//                 the next turn's context. LLM round-trip — rare path, OK.
//
// ⚠ Accept button REMOVED in v2 (B-MPP6-fastpath / 2026-05-12).
// Rationale: when a card is auto-executed (sub-threshold pay_api), the
// payment already cleared on-chain — there's nothing to "Accept" because
// it's already done. The Accept button confused users into thinking they
// were authorizing a pending action. Cancel is enough; silence = implicit
// accept.
//
// Click latch — once Regenerate or Cancel fires, both buttons disable.
// This structurally prevents:
//   - Double-fire (user clicks twice on a slow network)
//   - Multi-card ambiguity ("user has 3 DALL-E results in scrollback,
//     clicks Regenerate on the middle one") because clicking the middle
//     one would only fire if the middle card hadn't yet been clicked.
//   - Drift between "what the user sees" and "what the engine thinks
//     they did" (the latch makes the click commitment visible)
//
// Error-chip recovery — if onRegenerate's promise rejects, the latch
// resets and an inline error chip appears next to the buttons:
// "Regen failed — Try again". Click the chip = clear error + re-arm
// the buttons. Avoids the double-charge risk of auto-resetting the
// latch (which on a flaky-but-eventually-working outage could fire
// the regen multiple times).
//
// Cost footer — pulls from `data.price` (the same source CardPreview /
// TrackPlayer headers display in their per-card chrome). Single source of
// truth — no hardcoded "regen costs $0.04" strings.
//
// Design call rationale: see HANDOFF_NEXT_AGENT.md §3 + the B-MPP6 +
// B-MPP6-fastpath threads in the session transcript.
// ───────────────────────────────────────────────────────────────────────────

interface ReviewCardProps {
  /**
   * Source price for the cost-transparency footer. Pull from PayApiResult.price
   * — the same field CardPreview / TrackPlayer header chrome already displays.
   * Renders as "Each regeneration · $0.04" via fmtMppPrice (sub-cent floor).
   */
  price: string | number | undefined | null;
  /**
   * Human-readable noun for what's being reviewed. Used in the synthesized
   * Cancel message ("Cancel — discard this {noun}, I don't want to use it.")
   * and as the ARIA group label. Defaults to "preview" if omitted.
   */
  artifactNoun?: string;
  /**
   * NEW (B-MPP6-fastpath / 2026-05-12) — Async callback for Regenerate.
   * When provided, the card uses the client-driven fastpath (no LLM
   * round-trip); the parent is expected to call `useEngine.regenerateToolCall(toolUseId)`
   * inside the closure. Returns a promise so the card can:
   *   - latch to "Regenerating…" while in-flight
   *   - keep the latch on resolve (success — the new tool block appears
   *     in the timeline above, this card is "done")
   *   - reset the latch + show an inline error chip on reject
   * When NOT provided, Regenerate falls back to `onSendMessage("Regenerate the {noun}")`
   * for the legacy Option C LLM-round-trip path.
   */
  onRegenerate?: () => Promise<void>;
  /**
   * Engine sendMessage callback — typically `engine.sendMessage` threaded
   * through UnifiedTimeline → ChatMessage → BlockRouter → ToolBlockView →
   * ToolResultCard → registry. Used for:
   *   - Cancel (always — fires synthesized cancellation message)
   *   - Regenerate fallback (when `onRegenerate` is not provided)
   * When undefined (e.g. unauth session, demo mode), the Cancel button
   * renders disabled. Regenerate also disables UNLESS `onRegenerate` is
   * provided (which doesn't depend on `onSendMessage`).
   */
  onSendMessage?: (text: string) => void;
}

// [SPEC 23B-MPP6-fastpath UX polish / 2026-05-12]
//   'regenerating' — fastpath dispatch in-flight (latched, button reads "Regenerating…")
//   'regenerated'  — fastpath dispatch resolved successfully (latched terminal state,
//                    button reads "Regenerated"). Pre-fix this stayed at 'regenerating'
//                    forever, which read as "still in progress" instead of "this card
//                    produced its successor — see new card above". The latch INTENT
//                    was right (no double-regen on the same card), but the COPY was
//                    wrong. New 'regenerated' state surfaces the terminal-success
//                    distinct from the in-flight state.
//   'cancelled'    — Cancel button fired; card surrenders to the LLM acknowledgement turn.
//   null           — interactive (no click yet, or error reset).
type ClickedState = 'regenerating' | 'regenerated' | 'cancelled' | null;
type RegenError = { full: string; truncated: string } | null;

export function ReviewCard({
  price,
  artifactNoun = 'preview',
  onRegenerate,
  onSendMessage,
}: ReviewCardProps) {
  const [clicked, setClicked] = useState<ClickedState>(null);
  const [regenError, setRegenError] = useState<RegenError>(null);

  const isLatched = clicked !== null;
  const canRegenerate = Boolean(onRegenerate) || Boolean(onSendMessage);
  const canCancel = Boolean(onSendMessage);

  const handleRegenerate = async () => {
    if (isLatched || !canRegenerate) return;
    setRegenError(null);
    setClicked('regenerating');

    if (onRegenerate) {
      try {
        await onRegenerate();
        // [UX polish / 2026-05-12] Transition to terminal 'regenerated'
        // state so the label reads "Regenerated" instead of staying on
        // "Regenerating…" forever. Latch stays engaged — subsequent
        // regens happen on the NEW card that just appeared above.
        setClicked('regenerated');
      } catch (err) {
        const full = (err instanceof Error ? err.message : 'Try again').trim();
        setRegenError({ full, truncated: truncateError(full) });
        setClicked(null); // reset latch so retry is possible
      }
    } else {
      // Legacy Option C fallback: synthesize the message for the LLM.
      onSendMessage?.(`Regenerate the ${artifactNoun}`);
      // Latch stays — the LLM round-trip will produce a new tool block
      // above. No error path because we can't observe the LLM result here.
    }
  };

  const handleCancel = () => {
    if (isLatched || !canCancel) return;
    setRegenError(null);
    setClicked('cancelled');
    onSendMessage?.(
      `Cancel — discard this ${artifactNoun}, I don't want to use it.`,
    );
  };

  const handleErrorChipClick = () => {
    setRegenError(null);
  };

  const priceLabel = fmtMppPrice(price);
  const showCostFooter = priceLabel !== '—' && clicked === null && !regenError && (canRegenerate || canCancel);

  return (
    <div
      className="my-1.5 rounded-lg border border-border-subtle bg-surface-card overflow-hidden"
      role="group"
      aria-label={`Review the generated ${artifactNoun}`}
    >
      <div className="px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
          {clicked === 'regenerating'
            ? 'Regenerating…'
            : clicked === 'regenerated'
              ? '↻ Regenerated · See above'
              : clicked === 'cancelled'
                ? 'Cancelled'
                : regenError
                  ? 'Regen failed'
                  : 'Review'}
        </span>
        <div className="flex items-center gap-1.5">
          {regenError && (
            <button
              type="button"
              onClick={handleErrorChipClick}
              className="text-[11px] font-mono uppercase tracking-[0.06em] border rounded px-2.5 py-1 text-error-fg border-error-border bg-error-bg hover:opacity-80 transition-opacity"
              aria-label="Dismiss regen error and try again"
              title={regenError.full}
            >
              ⚠ {regenError.truncated} · Try again
            </button>
          )}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isLatched || !canRegenerate}
            className={`text-[11px] font-mono uppercase tracking-[0.06em] border rounded px-2.5 py-1 transition-colors ${
              clicked === 'regenerating'
                ? 'text-info-fg border-info-border bg-info-bg'
                : clicked === 'regenerated'
                  ? 'text-fg-muted border-border-subtle bg-surface-subtle opacity-60 cursor-not-allowed'
                  : 'text-fg-secondary border-border-subtle hover:text-fg-primary hover:border-border-strong disabled:opacity-40 disabled:hover:text-fg-secondary disabled:hover:border-border-subtle disabled:cursor-not-allowed'
            }`}
            aria-label={`Regenerate this ${artifactNoun}`}
          >
            {clicked === 'regenerating'
              ? 'Regenerating…'
              : clicked === 'regenerated'
                ? '↻ Regenerated'
                : '↻ Regenerate'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLatched || !canCancel}
            className={`text-[11px] font-mono uppercase tracking-[0.06em] border rounded px-2.5 py-1 transition-colors ${
              clicked === 'cancelled'
                ? 'text-error-fg border-error-border bg-error-bg'
                : 'text-fg-muted border-border-subtle hover:text-fg-primary hover:border-border-strong disabled:opacity-40 disabled:hover:text-fg-muted disabled:hover:border-border-subtle disabled:cursor-not-allowed'
            }`}
            aria-label={`Cancel and discard this ${artifactNoun}`}
          >
            Cancel
          </button>
        </div>
      </div>
      {showCostFooter && (
        <div className="px-4 pb-2 -mt-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-fg-muted">
            Each regeneration · {priceLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Truncate long error messages so the inline error chip stays compact.
 * Keep the first ~40 chars; the full message is also exposed via the
 * button's `title` attribute for hover-tooltip access.
 */
function truncateError(msg: string): string {
  const trimmed = msg.trim();
  if (trimmed.length <= 40) return trimmed;
  return trimmed.slice(0, 37) + '…';
}
