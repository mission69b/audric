'use client';

// ConfirmationChip — quiet single-line surface for "no-tx-receipt" write
// confirmations (cancel_payment_link).
// Ported from `apps/web/components/engine/cards/ConfirmationChip.tsx` by
// Phase 5a.4 (renderer migration sweep, 2026-05-19). Verbatim.
// [S.243 — 2026-05-22] save_contact removed from consumer list per
// V07E_CONTACTS_SIMPLIFICATION Path A. Component stays for cancel_*.
// [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23] cancel_invoice
// removed from consumer list — engine 2.17.0 deleted the tool. Payment
// links absorb the invoicing use case so cancel_payment_link covers
// every receivable.

interface ConfirmationChipProps {
  label: string;
  detail?: string;
  glyph?: string | null;
  tone?: 'success' | 'neutral';
}

export function ConfirmationChip({
  label,
  detail,
  glyph = '✓',
  tone = 'success',
}: ConfirmationChipProps) {
  const glyphColor =
    tone === 'success' ? 'text-success-solid' : 'text-fg-muted';

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
