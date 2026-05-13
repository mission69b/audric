'use client';

import { CardShell } from './primitives';

/**
 * # `<DownloadableArtifact>` — generic artifact-output card
 *
 * Renders the result of any audric-side tool that produces a hosted
 * artifact (PDF, image grid, future audio mixes, etc.) and returns a
 * Vercel Blob URL. Designed for the SPEC `spec_native_content_tools`
 * P5 surface — the chip-driven "your composed PDF / grid is ready"
 * affordance — but intentionally generic so future composition tools
 * can adopt it without a per-tool card primitive.
 *
 * ## Why a generic primitive (Option A in the spec D-1 lock)
 * The alternative was to extend the MPP renderer chain (`pay_api`'s
 * per-vendor cards: CardPreview, TrackPlayer, BookCover, …). But MPP
 * cards model a paid, vendor-specific transaction (paymentDigest,
 * service slug, vendor label). `compose_pdf` / `compose_image_grid`
 * are FREE, audric-internal, and have no vendor — wedging them into
 * the MPP chain would require either faking a vendor slug or forking
 * the chrome. A standalone primitive is cleaner.
 *
 * ## Visual contract
 * - Header: kind label ("PDF" or "IMAGE GRID") on the left,
 *   filename truncated on the right.
 * - Body:
 *   - For images: inline preview thumbnail (cover-fit, max 4:3 aspect)
 *     so the user sees the composite without clicking through.
 *   - For PDFs: metadata-only — filename, page count, size — because
 *     embedding a PDF preview would require a chromium-rendered iframe
 *     which is heavy and overkill for the chat surface.
 * - Footer: a download chip ("Open" or "Download") that opens the
 *   Vercel Blob URL in a new tab.
 *
 * ## Why the inline image preview matters
 * A user generates a 2x2 grid of 4 DALL-E images. Without a preview,
 * the chat shows "Composed 4 images into a 2x2 grid (1024×1024,
 * 124 KB)." with a link — they have to click to see the result.
 * With a preview, the result is the message; the click is just to
 * download or share. UX win for the dominant use case.
 */

export interface DownloadableArtifactData {
  url: string;
  filename: string;
  sizeKb: number;
  /** 'pdf' or 'image' — drives header label + preview behavior. */
  kind: 'pdf' | 'image';
  /** PDF-only: page count. Surfaced in the metadata strip. */
  pageCount?: number;
  /** Image-only: dimensions. Surfaced in the metadata strip. */
  width?: number;
  height?: number;
  /** Optional: ISO expiry timestamp from the tool result. Surfaced in the footer. */
  expiresAt?: string;
}

const KIND_LABEL: Record<DownloadableArtifactData['kind'], string> = {
  pdf: 'PDF',
  image: 'IMAGE GRID',
};

function fmtSize(sizeKb: number): string {
  if (sizeKb < 1024) return `${sizeKb} KB`;
  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

/**
 * Format the expiry as a relative window — "expires in 7 days",
 * "expires in 1 day", "expires today", "expired". Less noise than an
 * absolute date for a 7-day window the user usually doesn't care
 * about precisely.
 */
function fmtExpiry(expiresAt: string | undefined): string | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.round((t - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'expired';
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires in 1 day';
  return `expires in ${days} days`;
}

export function DownloadableArtifact({ data }: { data: DownloadableArtifactData }) {
  const { url, filename, sizeKb, kind, pageCount, width, height, expiresAt } = data;
  const isImage = kind === 'image';

  // Build the metadata strip. Order: dimensions/page count → size → expiry.
  const metaParts: string[] = [];
  if (isImage && width && height) {
    metaParts.push(`${width}×${height}`);
  } else if (!isImage && pageCount) {
    metaParts.push(`${pageCount} page${pageCount === 1 ? '' : 's'}`);
  }
  metaParts.push(fmtSize(sizeKb));
  const expiryText = fmtExpiry(expiresAt);
  if (expiryText) metaParts.push(expiryText);

  // Truncate filename in the header (long names from default
  // `audric-<13-digit-timestamp>.pdf` would crowd the right edge).
  const displayName = filename.length > 32
    ? `${filename.slice(0, 16)}…${filename.slice(-12)}`
    : filename;

  return (
    <CardShell title={KIND_LABEL[kind]} noPadding>
      <div className="flex flex-col">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URLs can't be optimized through next/image
          <img
            src={url}
            alt={`Composed ${kind}: ${filename}`}
            className="w-full block"
            style={{ maxHeight: '480px', objectFit: 'contain', background: 'var(--surface-sunken)' }}
            loading="lazy"
          />
        ) : (
          // PDF doesn't get an inline preview — render a clean placeholder
          // panel with a stylized PDF mark so the card still has visual
          // weight when collapsed in a long timeline.
          <div
            className="w-full grid place-items-center text-fg-muted"
            style={{
              aspectRatio: '4 / 3',
              background: 'linear-gradient(160deg, var(--surface-sunken), var(--surface-card))',
            }}
          >
            <div className="text-center">
              <div className="font-mono text-2xl tracking-[0.2em] text-fg-default">PDF</div>
              {pageCount && (
                <div className="font-mono text-[10px] tracking-[0.12em] uppercase mt-1.5 text-fg-muted">
                  {pageCount} page{pageCount === 1 ? '' : 's'} · {fmtSize(sizeKb)}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-3.5 py-2 border-t border-border-subtle bg-surface-sunken gap-2">
          <div className="flex flex-col min-w-0">
            <span className="font-mono text-[10px] tracking-[0.08em] text-fg-default truncate">
              {displayName}
            </span>
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted">
              {metaParts.join(' · ')}
            </span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-[0.12em] uppercase px-2.5 py-1.5 rounded border border-border-subtle bg-surface-card text-fg-default hover:bg-surface-elevated transition-colors flex-shrink-0"
            aria-label={`Download ${filename}`}
          >
            {isImage ? 'OPEN' : 'DOWNLOAD'}
          </a>
        </div>
      </div>
    </CardShell>
  );
}
