'use client';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B — N1 / N2 / N6 — ConfirmationChip primitive
//
// A quiet single-line surface that confirms the result of a "no-tx-receipt"
// write tool. Used today by:
//   - cancel_payment_link  (B-N1)
//   - cancel_invoice       (B-N2)
//   - save_contact         (B-N6)
//
// Design intent (vs CardShell):
//   - These tools don't produce on-chain transactions, so a full
//     TransactionReceiptCard would be overkill (no tx hash, no Suiscan link,
//     no gas line). A bordered card would make a "save contact" feel as
//     heavy as a "swap 1 SUI" — same border, same chrome.
//   - Inspired by demo `03-make-a-beat.html` step 9 success-receipt layout
//     (lines 116-128) but tighter (single line, no value pill, no
//     expanded copy block) — these confirmations are quieter than a sale.
//   - One line, mono uppercase verb, optional detail (slug / address). The
//     ✓ glyph leads so the eye reads "done · what was done · the thing".
//
// Visual: subtle border + transparent bg (matches CardShell's
// border-border-subtle but no inner padding box), single line, success-
// solid ✓ for confirmation. Detail text uses font-mono text-fg-secondary
// to match the existing `slug` / `0x...` typography across InvoiceCard /
// PaymentLinkCard.
// ───────────────────────────────────────────────────────────────────────────

interface ConfirmationChipProps {
  /** Verb describing what happened (e.g. "PAYMENT LINK CANCELLED"). Rendered
   *  uppercase + monospace + small. Caller passes the verb in the case
   *  they want; the chip will not transform it. */
  label: string;
  /** Optional secondary detail — slug, address, contact name. Rendered in
   *  monospace to match the existing slug/address typography. */
  detail?: string;
  /** Optional override for the leading glyph. Defaults to ✓. Set to
   *  null/undefined to suppress the glyph entirely. */
  glyph?: string | null;
  /** Visual tone — `'success'` (default, green ✓) or `'neutral'` (muted ✓).
   *  Cancellations use `'neutral'` because the user actively destroyed
   *  state — a green checkmark on "Cancelled" reads contradictory.
   *  `save_contact` uses `'success'` because saving IS a positive action. */
  tone?: 'success' | 'neutral';
}

export function ConfirmationChip({
  label,
  detail,
  glyph = '✓',
  tone = 'success',
}: ConfirmationChipProps) {
  const glyphColor = tone === 'success' ? 'text-success-solid' : 'text-fg-muted';

  return (
    <div
      className="my-1.5 flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card px-3 py-2"
      role="status"
      aria-label={detail ? `${label}: ${detail}` : label}
    >
      {glyph !== null && glyph !== undefined && (
        <span
          className={`text-[12px] leading-none ${glyphColor}`}
          aria-hidden="true"
        >
          {glyph}
        </span>
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-secondary">
        {label}
      </span>
      {detail && (
        <span className="ml-auto font-mono text-[11px] text-fg-primary truncate max-w-[60%]">
          {detail}
        </span>
      )}
    </div>
  );
}
