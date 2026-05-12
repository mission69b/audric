'use client';

import { useState } from 'react';
import { fmtMppPrice } from './chrome';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-MPP6 — ReviewCard primitive (Option C — plain sendMessage)
//
// Renders below previewable content-gen MPP results (DALL-E images today,
// ElevenLabs TTS today; PDFShift skipped — deprecating to fallback per
// `spec_native_content_tools` HANDOFF §5; Lob/Resend skipped — terminal,
// no regen possible). Three buttons:
//
//   • Accept     — client-only dismiss. No LLM call. The user is signaling
//                  "I'm done with this preview, don't ask again."
//
//   • Regenerate — fires `onSendMessage("Regenerate the preview")`. The LLM
//                  re-calls the same MPP tool from prior-turn context. Costs
//                  a full LLM round-trip for v1 — acceptable for low-volume
//                  pre-launch usage. Migration to a server-side fast-path
//                  bypass is tracked as B-MPP6-fastpath in SPEC 23B inventory.
//
//   • Cancel     — fires `onSendMessage("Cancel — discard this preview...")`
//                  so the LLM acknowledges + doesn't carry the preview into
//                  the next turn's context. Then dismisses the buttons.
//
// Click latch — once ANY button fires, all three disable. This structurally
// prevents the multi-preview ambiguity case ("user has 3 DALL-E results in
// scrollback, clicks Regenerate on the middle one") because clicking the
// middle one's Regenerate would only fire if the middle card hadn't yet
// been clicked. In practice the LLM is generating one preview at a time,
// the latest preview is always the relevant one, and the latch prevents
// any double-fire.
//
// Cost footer — pulls from `data.price` (the same source CardPreview /
// TrackPlayer headers display in their per-card chrome). Single source of
// truth — no hardcoded "regen costs $0.04" strings.
//
// Design call rationale: see HANDOFF_NEXT_AGENT.md §3 + the B-MPP6 thread
// in this session's transcript. Locked Option C (plain sendMessage) over
// A+ (directive-wrapped) because the click-latch already solves the
// multi-preview disambiguation problem A+ was solving via toolUseId.
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
   * Engine sendMessage callback — typically `engine.sendMessage` threaded
   * through UnifiedTimeline → ChatMessage → BlockRouter → ToolBlockView →
   * ToolResultCard → registry. When undefined (e.g. unauth session, demo
   * mode), the buttons render disabled — the user can read the preview but
   * can't take action.
   */
  onSendMessage?: (text: string) => void;
}

type ClickedState = 'accepted' | 'regenerated' | 'cancelled' | null;

export function ReviewCard({
  price,
  artifactNoun = 'preview',
  onSendMessage,
}: ReviewCardProps) {
  const [clicked, setClicked] = useState<ClickedState>(null);

  const isLatched = clicked !== null;
  const noActionAvailable = !onSendMessage;

  const handleAccept = () => {
    if (isLatched || noActionAvailable) return;
    setClicked('accepted');
  };

  const handleRegenerate = () => {
    if (isLatched || noActionAvailable) return;
    setClicked('regenerated');
    onSendMessage?.(`Regenerate the ${artifactNoun}`);
  };

  const handleCancel = () => {
    if (isLatched || noActionAvailable) return;
    setClicked('cancelled');
    onSendMessage?.(
      `Cancel — discard this ${artifactNoun}, I don't want to use it.`,
    );
  };

  const priceLabel = fmtMppPrice(price);
  const showCostFooter = priceLabel !== '—';

  return (
    <div
      className="my-1.5 rounded-lg border border-border-subtle bg-surface-card overflow-hidden"
      role="group"
      aria-label={`Review the generated ${artifactNoun}`}
    >
      <div className="px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
          {clicked === 'accepted'
            ? 'Accepted'
            : clicked === 'regenerated'
              ? 'Regenerating…'
              : clicked === 'cancelled'
                ? 'Cancelled'
                : 'Review'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAccept}
            disabled={isLatched || noActionAvailable}
            className={`text-[11px] font-mono uppercase tracking-[0.06em] border rounded px-2.5 py-1 transition-colors ${
              clicked === 'accepted'
                ? 'text-success-solid border-success-border bg-success-bg'
                : 'text-fg-secondary border-border-subtle hover:text-fg-primary hover:border-border-strong disabled:opacity-40 disabled:hover:text-fg-secondary disabled:hover:border-border-subtle disabled:cursor-not-allowed'
            }`}
            aria-label={`Accept this ${artifactNoun}`}
          >
            {clicked === 'accepted' ? '✓ Accepted' : 'Accept'}
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isLatched || noActionAvailable}
            className={`text-[11px] font-mono uppercase tracking-[0.06em] border rounded px-2.5 py-1 transition-colors ${
              clicked === 'regenerated'
                ? 'text-info-fg border-info-border bg-info-bg'
                : 'text-fg-secondary border-border-subtle hover:text-fg-primary hover:border-border-strong disabled:opacity-40 disabled:hover:text-fg-secondary disabled:hover:border-border-subtle disabled:cursor-not-allowed'
            }`}
            aria-label={`Regenerate this ${artifactNoun}`}
          >
            {clicked === 'regenerated' ? 'Regenerating…' : '↻ Regenerate'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLatched || noActionAvailable}
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
      {showCostFooter && clicked === null && !noActionAvailable && (
        <div className="px-4 pb-2 -mt-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-fg-muted">
            Each regeneration · {priceLabel}
          </span>
        </div>
      )}
    </div>
  );
}
