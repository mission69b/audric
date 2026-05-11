'use client';

/**
 * SPEC 23B-MPP1 — BookCover primitive.
 *
 * Renders the output of a PDF-binding MPP service (PDFShift, etc.) — the
 * "creator just shipped a real-world product" surface. Mirrors demo
 * `04-coloring-book.html`'s `<BookCover>`: cream gradient → 120×160
 * paper-card with title → page-thumbnail row → meta footer.
 *
 * Defensive PDF extraction:
 *   PDFShift:  { url: "...", page_count?, format? ("A4" | "letter" | …) }
 *   Generic:   { url, pages?, format? }
 *
 * The cover art is the FIRST page rendered as a paper card. If the
 * upstream returns no preview image (PDFShift typically doesn't — just
 * a URL to the bound PDF), we fall back to a minimal cream-on-white
 * paper card with the title in serif. The page-thumbnail row shows
 * the first 6 pages as numbered cards; remaining pages collapse to "+N".
 */

import { MppCardShell, MppHeader, MppFooter, MppTag, fmtMppPrice } from './chrome';
import type { PayApiResult } from './registry';

interface ExtractedBook {
  url: string;
  pageCount?: number;
  format?: string;
  title?: string;
  coverUrl?: string;
}

function extractBook(result: unknown): ExtractedBook | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  if (typeof r.url !== 'string') return null;

  return {
    url: r.url,
    pageCount:
      typeof r.page_count === 'number'
        ? r.page_count
        : typeof r.pages === 'number'
          ? r.pages
          : undefined,
    format: typeof r.format === 'string' ? r.format : undefined,
    title: typeof r.title === 'string' ? r.title : undefined,
    coverUrl: typeof r.cover_url === 'string' ? r.cover_url : undefined,
  };
}

const PAPER_CREAM_GRADIENT = 'linear-gradient(135deg, #FFF5E6, #FFE2C2)';

export function BookCover({ data }: { data: PayApiResult }) {
  const book = extractBook(data.result);
  const pageCount = book?.pageCount ?? 0;
  const visiblePages = Math.min(pageCount, 6);
  const hiddenPages = Math.max(pageCount - visiblePages, 0);

  return (
    <MppCardShell
      bodyNoPadding
      header={
        <MppHeader
          caption="PDFSHIFT · BOUND"
          right={fmtMppPrice(data.price)}
        />
      }
      footer={
        <MppFooter
          meta={`BOUND BY PDFSHIFT${book?.format ? ` · ${book.format.toUpperCase()}` : ''}${pageCount > 0 ? ` · ${pageCount}PP` : ''}`}
          tag={book?.url ? <MppTag tone="purple">PDF READY</MppTag> : undefined}
        />
      }
    >
      <div className="flex gap-4 items-center p-4" style={{ background: PAPER_CREAM_GRADIENT }}>
        {/* Paper-card cover (120×160) */}
        <div
          className="rounded-md flex-shrink-0 relative overflow-hidden"
          style={{
            width: 96,
            height: 128,
            background: '#fff',
            boxShadow: '0 6px 18px rgba(0,0,0,0.12), 0 1px 0 rgba(0,0,0,0.05)',
          }}
        >
          {book?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- vendor URL, not optimisable
            <img src={book.coverUrl} alt="Cover" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 grid place-items-center px-2 text-center">
              <span className="font-serif text-[11px] leading-tight" style={{ color: '#1A1A1A' }}>
                {book?.title ?? 'Bound PDF'}
              </span>
            </div>
          )}
        </div>

        {/* Title + page row */}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-muted">
            {pageCount > 0 ? `PREVIEW · ${pageCount} PAGES` : 'PREVIEW · BOUND PDF'}
            {book?.format ? ` · ${book.format.toUpperCase()}` : ''}
          </div>
          <div className="font-serif text-lg mt-1 leading-tight" style={{ color: '#1A1A1A' }}>
            {book?.title ?? 'Bound PDF'}
          </div>

          {visiblePages > 0 && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {Array.from({ length: visiblePages }).map((_, i) => (
                <div
                  key={`page-${i + 1}`}
                  className="rounded-sm grid place-items-center font-mono text-[8px]"
                  style={{
                    width: 22,
                    height: 30,
                    background: '#fff',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--fg-muted)',
                  }}
                >
                  P{i + 1}
                </div>
              ))}
              {hiddenPages > 0 && (
                <div
                  className="grid place-items-center font-mono text-[8px]"
                  style={{ width: 22, height: 30, color: 'var(--fg-muted)' }}
                >
                  +{hiddenPages}
                </div>
              )}
            </div>
          )}

          {book?.url && (
            <a
              href={book.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-info-solid hover:opacity-70 transition"
            >
              Open PDF →
            </a>
          )}
        </div>
      </div>
    </MppCardShell>
  );
}
