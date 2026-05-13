/**
 * Unit tests for `<DownloadableArtifact>` — the generic artifact card
 * shipped with SPEC `spec_native_content_tools` P5.
 *
 * Verifies:
 *   - PDF kind renders the metadata-only placeholder (no <img>)
 *   - Image kind renders an inline preview <img> with the artifact URL
 *   - The download chip points at the artifact URL with target=_blank
 *   - Filename truncates predictably for long names
 *   - Size formats KB → MB above 1024 KB
 *   - Expiry text formats relative ("expires in N days")
 *
 * What we don't test:
 *   - Visual layout / pixel dimensions. The CardShell primitive owns
 *     that and is exercised by every other card test indirectly.
 *   - Animation / interaction behavior. The card is static.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DownloadableArtifact } from './DownloadableArtifact';

afterEach(() => {
  vi.useRealTimers();
});

describe('DownloadableArtifact — PDF kind', () => {
  it('renders the PDF placeholder (no <img>) and header', () => {
    const { container, queryAllByText } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://blob.vercel-storage.com/audric-test.pdf',
          filename: 'audric-test.pdf',
          sizeKb: 124,
          pageCount: 3,
        }}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    // Header label + placeholder mark both contain "PDF" — assert ≥1 match
    // rather than exactly one (the header label and the body placeholder
    // mark both render the literal "PDF").
    expect(queryAllByText('PDF').length).toBeGreaterThanOrEqual(1);
    // Page-count + size in the placeholder strip
    expect(container.textContent).toMatch(/3 pages/);
    expect(container.textContent).toMatch(/124 KB/);
  });

  it('renders "1 page" (singular) when pageCount=1', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://blob.vercel-storage.com/x.pdf',
          filename: 'x.pdf',
          sizeKb: 5,
          pageCount: 1,
        }}
      />,
    );
    expect(container.textContent).toMatch(/1 page(?!s)/);
  });

  it('omits page-count from the placeholder strip when pageCount is missing', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://blob.vercel-storage.com/x.pdf',
          filename: 'x.pdf',
          sizeKb: 5,
        }}
      />,
    );
    // The center placeholder shows "PDF" only — no page-count badge.
    expect(container.textContent).not.toMatch(/page/i);
  });

  it('renders DOWNLOAD chip pointing at the artifact URL', () => {
    const { getByRole } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://blob.vercel-storage.com/audric-x.pdf',
          filename: 'audric-x.pdf',
          sizeKb: 12,
          pageCount: 2,
        }}
      />,
    );

    const link = getByRole('link');
    expect(link.getAttribute('href')).toBe(
      'https://blob.vercel-storage.com/audric-x.pdf',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toMatch(/DOWNLOAD/);
  });
});

describe('DownloadableArtifact — image kind', () => {
  it('renders an <img> with the artifact URL as src', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'image',
          url: 'https://blob.vercel-storage.com/grid.webp',
          filename: 'audric-grid-2x2.webp',
          sizeKb: 56,
          width: 1024,
          height: 1024,
        }}
      />,
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(
      'https://blob.vercel-storage.com/grid.webp',
    );
    // Header label says IMAGE GRID, not PDF.
    expect(container.textContent).toMatch(/IMAGE GRID/);
  });

  it('renders OPEN chip (instead of DOWNLOAD) for images', () => {
    const { getByRole } = render(
      <DownloadableArtifact
        data={{
          kind: 'image',
          url: 'https://blob.vercel-storage.com/g.webp',
          filename: 'g.webp',
          sizeKb: 30,
          width: 512,
          height: 512,
        }}
      />,
    );
    expect(getByRole('link').textContent).toMatch(/OPEN/);
  });

  it('shows dimensions in the meta strip', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'image',
          url: 'https://blob.vercel-storage.com/g.webp',
          filename: 'g.webp',
          sizeKb: 30,
          width: 1024,
          height: 768,
        }}
      />,
    );
    expect(container.textContent).toMatch(/1024×768/);
  });
});

describe('DownloadableArtifact — snapshot disclaimer (Bug B / 2026-05-13)', () => {
  it('renders the snapshot disclaimer chip on PDF artifacts', () => {
    const { getByTestId } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 5,
          pageCount: 1,
        }}
      />,
    );
    const chip = getByTestId('snapshot-disclaimer');
    expect(chip.textContent).toMatch(/Snapshot/);
    expect(chip.textContent).toMatch(/re-run the prompt/i);
  });

  it('renders the snapshot disclaimer chip on image artifacts', () => {
    const { getByTestId } = render(
      <DownloadableArtifact
        data={{
          kind: 'image',
          url: 'https://x/g.webp',
          filename: 'g.webp',
          sizeKb: 30,
          width: 512,
          height: 512,
        }}
      />,
    );
    const chip = getByTestId('snapshot-disclaimer');
    expect(chip.textContent).toMatch(/Snapshot/);
  });

  it('renders the disclaimer exactly once per card', () => {
    // Defends against a regression where the chip was inadvertently
    // rendered both inside the metadata column AND in a footer row.
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 5,
          pageCount: 1,
        }}
      />,
    );
    expect(
      container.querySelectorAll('[data-testid="snapshot-disclaimer"]').length,
    ).toBe(1);
  });
});

describe('DownloadableArtifact — formatting helpers', () => {
  it('formats sub-1MB sizes as KB', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 512,
          pageCount: 1,
        }}
      />,
    );
    expect(container.textContent).toMatch(/512 KB/);
    expect(container.textContent).not.toMatch(/MB/);
  });

  it('formats >=1MB sizes as MB with one decimal', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 1500,
          pageCount: 1,
        }}
      />,
    );
    expect(container.textContent).toMatch(/1\.5 MB/);
  });

  it('truncates long filenames in the header strip', () => {
    const longName = 'audric-1778633102461-supercalifragilistic-very-long-name.pdf';
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: longName,
          sizeKb: 5,
          pageCount: 1,
        }}
      />,
    );
    // Should contain an ellipsis somewhere in the rendered text.
    expect(container.textContent).toMatch(/…/);
    // And NOT the full long name verbatim.
    expect(container.textContent).not.toMatch(/supercalifragilistic-very-long/);
  });

  it('keeps short filenames intact', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'short.pdf',
          sizeKb: 5,
          pageCount: 1,
        }}
      />,
    );
    expect(container.textContent).toMatch(/short\.pdf/);
  });

  it('formats expiry as "expires in N days"', () => {
    const expires = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 5,
          pageCount: 1,
          expiresAt: expires,
        }}
      />,
    );
    expect(container.textContent).toMatch(/expires in 5 days/);
  });

  it('formats expiry as "expired" when in the past', () => {
    const expires = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 5,
          pageCount: 1,
          expiresAt: expires,
        }}
      />,
    );
    expect(container.textContent).toMatch(/expired/);
  });

  it('omits expiry from the meta strip when expiresAt is missing', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 5,
          pageCount: 1,
        }}
      />,
    );
    expect(container.textContent).not.toMatch(/expires/);
    expect(container.textContent).not.toMatch(/expired/);
  });

  it('handles malformed expiresAt gracefully (treats as missing)', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/a.pdf',
          filename: 'a.pdf',
          sizeKb: 5,
          pageCount: 1,
          expiresAt: 'not-a-date',
        }}
      />,
    );
    expect(container.textContent).not.toMatch(/expires/i);
  });
});

describe('DownloadableArtifact — accessibility', () => {
  it('image alt text describes the artifact', () => {
    const { container } = render(
      <DownloadableArtifact
        data={{
          kind: 'image',
          url: 'https://x/g.webp',
          filename: 'my-collage.webp',
          sizeKb: 30,
          width: 512,
          height: 512,
        }}
      />,
    );
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toMatch(/my-collage\.webp/);
  });

  it('download chip has an aria-label that names the file', () => {
    const { getByRole } = render(
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: 'https://x/report.pdf',
          filename: 'report.pdf',
          sizeKb: 5,
          pageCount: 1,
        }}
      />,
    );
    expect(getByRole('link').getAttribute('aria-label')).toMatch(/report\.pdf/);
  });
});
