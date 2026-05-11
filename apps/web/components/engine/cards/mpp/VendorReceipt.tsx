'use client';

/**
 * SPEC 23B-MPP1 — VendorReceipt primitive.
 *
 * Renders the output of any physical-fulfilment / data-vendor MPP service
 * (Lob, Teleflora, CakeBoss, Amazon, Walmart, Party City, OpenWeather,
 * Anthropic, …). Mirrors demo `06-party-shop.html`'s `<ShopReceipt>`:
 * vendor tag (top-left) + cost (top-right, serif) → item description →
 * ETA / status line (bottom, mono green).
 *
 * Defensive description extraction — every vendor has its own response
 * shape. We try a few common shapes (`description`, `item`, `name`,
 * top-level `summary`), then fall back to the engine's legacy
 * `data.serviceName` / `data.deliveryEstimate` / generic vendor name.
 *
 * Unlike CardPreview/TrackPlayer/BookCover, this card is purely textual —
 * no image, no audio, no PDF. The vendor tag IS the visual identity.
 */

import { MppCardShell, MppHeader, MppTag, fmtMppPrice } from './chrome';
import type { PayApiResult } from './registry';

interface VendorReceiptProps {
  data: PayApiResult;
  /**
   * Display name of the vendor — passed by the registry. The renderer
   * map decides what to show (e.g. "Lob", "Teleflora", "CakeBoss"). When
   * undefined, falls back to the engine's `data.serviceName` or "MPP".
   */
  vendor?: string;
}

interface ExtractedDelivery {
  description: string;
  status?: string;
}

function extractDelivery(result: unknown, fallback: PayApiResult): ExtractedDelivery {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.description === 'string') {
      return {
        description: r.description,
        status: typeof r.status === 'string' ? r.status : undefined,
      };
    }
    if (typeof r.item === 'string') {
      return { description: r.item, status: typeof r.status === 'string' ? r.status : undefined };
    }
    if (typeof r.summary === 'string') {
      return { description: r.summary };
    }
    if (typeof r.name === 'string') {
      return { description: r.name };
    }
    // Lob: { tracking_number, expected_delivery_date, ... } → use ETA as description
    if (typeof r.expected_delivery_date === 'string') {
      return {
        description: 'Print + mail',
        status: `ETA · ${r.expected_delivery_date}`,
      };
    }
  }

  if (fallback.deliveryEstimate) {
    return { description: 'Service call', status: fallback.deliveryEstimate };
  }

  return { description: fallback.serviceName ?? 'Service call' };
}

function defaultVendorLabel(data: PayApiResult, vendor: string | undefined): string {
  if (vendor) return vendor.toUpperCase();
  if (data.serviceName) return data.serviceName.toUpperCase();
  return 'MPP';
}

export function VendorReceipt({ data, vendor }: VendorReceiptProps) {
  const delivery = extractDelivery(data.result, data);
  const vendorLabel = defaultVendorLabel(data, vendor);

  return (
    <MppCardShell
      txDigest={data.paymentDigest}
      header={
        <MppHeader
          showSparkle={false}
          caption={`${vendorLabel} · MPP`}
          right={fmtMppPrice(data.price)}
        />
      }
    >
      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <MppTag tone="dark">{vendorLabel}</MppTag>
        </div>

        <div className="text-sm text-fg-primary leading-snug">{delivery.description}</div>

        {delivery.status && (
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-success-solid">
            ✓ {delivery.status}
          </div>
        )}
      </div>
    </MppCardShell>
  );
}
