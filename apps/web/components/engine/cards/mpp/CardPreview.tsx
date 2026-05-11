'use client';

/**
 * SPEC 23B-MPP1 — CardPreview primitive.
 *
 * Renders the output of an image-generation MPP service (DALL-E, Fal-Flux,
 * etc.). Mirrors demo `05-mums-birthday.html`'s `<CardPreview>` chrome:
 * sparkle-prefixed header → image surface (4:5 aspect, full-bleed) →
 * footer with dimensions/tier + AI-DESIGNED pill.
 *
 * Defensive image extraction — vendor result shapes vary:
 *   Fal-Flux:  { images: [{ url: "...", width, height }, ...] }
 *   DALL-E:    { data: [{ url: "..." }] }   (legacy OpenAI shape)
 *   Direct:    { url: "..." }                (single-image shorthand)
 *
 * If no image URL can be extracted, the surface degrades to a placeholder
 * gradient panel with the caption "Preview unavailable" — never throws,
 * never renders nothing.
 */

import { MppCardShell, MppHeader, MppFooter, MppTag, fmtMppPrice } from './chrome';
import type { PayApiResult } from './registry';

interface ExtractedImage {
  url: string;
  width?: number;
  height?: number;
}

function extractImage(result: unknown): ExtractedImage | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  // Fal-Flux: { images: [{ url, width, height }, ...] }
  if (Array.isArray(r.images) && r.images.length > 0) {
    const first = r.images[0] as Record<string, unknown>;
    if (typeof first?.url === 'string') {
      return {
        url: first.url,
        width: typeof first.width === 'number' ? first.width : undefined,
        height: typeof first.height === 'number' ? first.height : undefined,
      };
    }
  }

  // DALL-E legacy: { data: [{ url }] }
  if (Array.isArray(r.data) && r.data.length > 0) {
    const first = r.data[0] as Record<string, unknown>;
    if (typeof first?.url === 'string') return { url: first.url };
  }

  // Single-image shorthand: { url } or { image_url }
  if (typeof r.url === 'string') return { url: r.url };
  if (typeof r.image_url === 'string') return { url: r.image_url };

  return null;
}

function vendorLabel(serviceId: string | undefined): string {
  if (!serviceId) return 'IMAGE PREVIEW';
  if (serviceId.toLowerCase().includes('flux')) return 'FAL FLUX · GENERATED';
  if (serviceId.toLowerCase().includes('dall')) return 'DALL-E · GENERATED';
  if (serviceId.toLowerCase().startsWith('fal')) return 'FAL · GENERATED';
  return 'IMAGE PREVIEW';
}

export function CardPreview({ data }: { data: PayApiResult }) {
  const image = extractImage(data.result);
  const dimensions = image?.width && image?.height ? `${image.width}×${image.height}` : null;

  return (
    <MppCardShell
      bodyNoPadding
      header={
        <MppHeader
          caption={vendorLabel(data.serviceId)}
          right={fmtMppPrice(data.price)}
        />
      }
      footer={
        <MppFooter
          meta={dimensions ?? 'AI-generated · 4:5'}
          tag={<MppTag tone="purple">AI-DESIGNED</MppTag>}
        />
      }
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- vendor URLs are arbitrary; next/image's optimizer can't proxy them
        <img
          src={image.url}
          alt="Generated image preview"
          className="w-full block"
          style={{ aspectRatio: '4 / 5', objectFit: 'cover' }}
          loading="lazy"
        />
      ) : (
        <div
          className="w-full grid place-items-center text-fg-muted text-xs font-mono"
          style={{
            aspectRatio: '4 / 5',
            background: 'linear-gradient(160deg, var(--surface-sunken), var(--surface-card))',
          }}
        >
          Preview unavailable
        </div>
      )}
    </MppCardShell>
  );
}
