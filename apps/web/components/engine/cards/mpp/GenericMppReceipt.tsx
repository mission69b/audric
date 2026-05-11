'use client';

/**
 * SPEC 23B-MPP1 — GenericMppReceipt fallback.
 *
 * Renders when `renderMppService` can't find a registered renderer for
 * the vendor slug. Mirrors the pre-MPP1 `TransactionReceiptCard.pay_api`
 * branch (Service / Cost / Delivery 3-line render) so unknown services
 * still get a passable card — this is a strict no-regression on the
 * pre-MPP1 surface, by construction.
 *
 * Once B-MPP2 wires `renderMppService` into `TransactionReceiptCard`,
 * this component is the ONLY remaining consumer of the legacy
 * `serviceName` / `amount` / `deliveryEstimate` fields. Future
 * deprecation of those fields can pivot through here without touching
 * the per-vendor primitives.
 */

import { MppCardShell, MppHeader, MppTag, fmtMppPrice } from './chrome';
import type { PayApiResult } from './registry';

function vendorFromServiceId(serviceId: string | undefined): string | null {
  if (!serviceId) return null;
  // Take the first path segment, capitalised
  const stripped = serviceId.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
  const first = stripped.split('/')[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function GenericMppReceipt({ data }: { data: PayApiResult }) {
  const vendor =
    data.serviceName ?? vendorFromServiceId(data.serviceId) ?? 'MPP Service';
  const priceText =
    data.amount != null ? `$${data.amount.toFixed(2)}` : fmtMppPrice(data.price);

  return (
    <MppCardShell
      txDigest={data.paymentDigest}
      header={
        <MppHeader
          showSparkle={false}
          caption={`${vendor.toUpperCase()} · MPP`}
          right={priceText}
        />
      }
    >
      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <MppTag tone="dark">{vendor.toUpperCase()}</MppTag>
        </div>

        {(data.deliveryEstimate || data.serviceId) && (
          <div className="text-sm text-fg-primary leading-snug">
            {data.deliveryEstimate ?? `Service call: ${data.serviceId}`}
          </div>
        )}
      </div>
    </MppCardShell>
  );
}
