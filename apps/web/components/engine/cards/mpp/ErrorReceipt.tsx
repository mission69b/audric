'use client';

/**
 * SPEC 23B-MPP6 v1.1 (2026-05-12) — ErrorReceipt primitive.
 *
 * Renders when `pay_api` returns an error envelope (`success: false`).
 * Replaces the pre-v1.1 fallthrough to `<GenericMppReceipt>` which
 * silently rendered "MPP SERVICE · MPP" with `—` price for any failed
 * call — see `bug_audric_error_receipt_shape` in HANDOFF §8 (and the
 * 2026-05-12 ElevenLabs smoke that surfaced it).
 *
 * Two error states, distinguished by `data.paymentConfirmed`:
 *
 *   1. PAID-BUT-FAILED (`paymentConfirmed: true`)
 *      The on-chain USDC leg succeeded but the upstream service
 *      errored after charge. User WAS charged. Refund flow needed.
 *      Shows: vendor name + "Service failed · payment charged" + the
 *      gateway error message + Suiscan link (proof of charge).
 *
 *   2. NOT-CHARGED (`paymentConfirmed: false` or undefined)
 *      Network failure / validation error before chain. User was NOT
 *      charged. Retry is safe.
 *      Shows: vendor name + "Service unreachable · no charge" + the
 *      gateway error message. No Suiscan link (no on-chain payment).
 *
 * Both states render the warning ⚠ chrome (warning-solid token), NOT
 * the success ✦ sparkle. Vendor name comes from `serviceId` (preserved
 * by `executeToolAction.pay_api` v1.1 even on error) — falls back to
 * "MPP" if the gateway dropped the URL too (rare, but defensive).
 *
 * Why this lives next to VendorReceipt + GenericMppReceipt:
 * Same chrome family (MppCardShell + MppHeader + MppTag), same outer
 * margins, same Suiscan footer pattern. The ONLY visual differences
 * are the warning glyph + "ERROR" tag tone — kept tight intentionally
 * so the failed cards stay recognisably part of the MPP family.
 *
 * No <ReviewCard> — error states are terminal. The user can't
 * regenerate a service that's broken; they need to contact support
 * (paid case) or simply re-prompt (unpaid case).
 */

import { MppCardShell, MppHeader, MppTag, fmtMppPrice } from './chrome';
import { normaliseServiceSlug } from './registry';
import type { PayApiResult } from './registry';
import { ReceiptChoreography } from '../../motion/ReceiptChoreography';

/**
 * Vendor-slug → display label. Same set as the registry's supported
 * services. Unknown vendors fall back to a humanised slug
 * (capitalise first letter) — better than "MPP" because the user at
 * least sees which surface failed.
 */
const VENDOR_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  pdfshift: 'PDFShift',
  lob: 'Lob',
  resend: 'Resend',
};

function vendorLabelFromServiceId(serviceId: string | undefined | null): string {
  const slug = normaliseServiceSlug(serviceId);
  if (!slug) return 'MPP';
  return VENDOR_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function ErrorReceipt({ data }: { data: PayApiResult }) {
  const vendor = vendorLabelFromServiceId(data.serviceId);
  const wasCharged = data.paymentConfirmed === true;
  const errorMsg = data.error ?? 'Service request failed';

  // Header right-side: show price for the paid case (the user wants to
  // see what they were charged), em-dash for the unpaid case (no fee).
  const priceText = wasCharged ? fmtMppPrice(data.price) : '—';

  // Status line — different copy for paid vs unpaid. Mono caps to match
  // VendorReceipt's "✓ ETA · ..." styling; warning tone instead of
  // success tone.
  const statusLine = wasCharged
    ? `Payment charged · refund pending`
    : `No charge · safe to retry`;

  return (
    <ReceiptChoreography tone="error">
      <MppCardShell
        // Only render Suiscan link when the payment actually went on-chain.
        // Unpaid errors have no digest to link to.
        txDigest={wasCharged ? data.paymentDigest : undefined}
        header={
          <MppHeader
            showSparkle={false}
            caption={`${vendor.toUpperCase()} · MPP · FAILED`}
            right={priceText}
          />
        }
      >
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <MppTag tone="dark">{vendor.toUpperCase()}</MppTag>
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-warning-solid shrink-0">
              ⚠ Error
            </span>
          </div>

          <div className="text-sm text-fg-primary leading-snug">{errorMsg}</div>

          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-warning-solid">
            ⚠ {statusLine}
          </div>
        </div>
      </MppCardShell>
    </ReceiptChoreography>
  );
}
