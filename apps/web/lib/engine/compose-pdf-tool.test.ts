import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '@t2000/engine';
import { PDFDocument } from 'pdf-lib';

/**
 * Unit tests for `composePdfTool` — the audric-side native PDF
 * composition tool that replaces `pay_api(pdfshift/...)` for the
 * "compose what we already have" use case.
 *
 * What these tests verify:
 *   1. Schema + preflight enforce input bounds (G3).
 *   2. Image pages embed PNG and JPEG bytes correctly (G1).
 *   3. Text pages render title + body without throwing (G1).
 *   4. Text overflow wraps onto continuation pages (long content path).
 *   5. The Vercel Blob upload is called with the right shape (G4) and
 *      its returned URL flows back through the tool result.
 *   6. The 7-day expiresAt is computed correctly (D-2 lock).
 *   7. The "Blob not configured" path returns a clear, operator-
 *      actionable error.
 *   8. The output PDF parses round-trip via pdf-lib (G1 sanity).
 *
 * What these tests DON'T verify (deliberately):
 *   - Layout pixel positions of rendered text/images. pdf-lib has its
 *     own test suite for that. We assert page count + parseability.
 *   - Network timing / retry on transient image-fetch failures. The
 *     spec scope is "single-pass composition"; retries are a follow-up
 *     concern if production reveals flakiness.
 *   - Concurrent invocations. The tool is stateless server-side
 *     (pdf-lib creates a fresh PDFDocument per call); no cross-call
 *     state can leak.
 */

const { mockPut } = vi.hoisted(() => ({
  mockPut: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  put: mockPut,
}));

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    BLOB_READ_WRITE_TOKEN: 'vercel-blob-test-token',
  } as { BLOB_READ_WRITE_TOKEN?: string },
}));

vi.mock('@/lib/env', () => ({
  env: mockEnv,
}));

import { composePdfTool } from './compose-pdf-tool';

const ctx = (): ToolContext =>
  ({
    agent: undefined,
    mcpManager: undefined,
    walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }) as unknown as ToolContext;

// ─── Fixture factories ────────────────────────────────────────────────

/**
 * Smallest valid PNG: 1×1 transparent pixel. Used everywhere we need
 * an "image page" without coupling to a real image source.
 *
 * Bytes are the canonical 1×1 transparent PNG that every PNG decoder
 * recognizes — pasted in directly so the test doesn't need a fixture
 * file. Roughly 67 bytes including the IHDR + IDAT + IEND chunks.
 */
function tinyPngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

/**
 * Tiny valid JPEG: SOI + APP0 (JFIF) + DQT + SOF + DHT + SOS + EOI.
 * ~125 bytes. Generated once with `sharp` then pasted; lets us exercise
 * the embedJpg branch without a fixture file.
 *
 * If pdf-lib's JPEG parser becomes stricter and rejects this in a
 * future bump, regenerate via:
 *   await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).jpeg().toBuffer()
 */
function tinyJpegBytes(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x37, 0xff, 0xd9,
  ]);
}

beforeEach(() => {
  mockPut.mockReset();
  mockPut.mockResolvedValue({
    url: 'https://blob.vercel-storage.com/audric-test-abc123.pdf',
    downloadUrl: 'https://blob.vercel-storage.com/audric-test-abc123.pdf',
    pathname: 'audric-test-abc123.pdf',
    contentType: 'application/pdf',
    contentDisposition: 'inline; filename="audric-test-abc123.pdf"',
  });

  mockEnv.BLOB_READ_WRITE_TOKEN = 'vercel-blob-test-token';

  // Default fetch returns a tiny PNG — most image-page tests want this.
  // Tests that need to test JPEG / errors override per-test.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => tinyPngBytes().buffer,
    })),
  );
});

// ─── Declarative shape ────────────────────────────────────────────────

describe('composePdfTool — declarative shape', () => {
  it('is named compose_pdf', () => {
    expect(composePdfTool.name).toBe('compose_pdf');
  });

  it('runs auto so the engine never gates on user confirm', () => {
    expect(composePdfTool.permissionLevel).toBe('auto');
  });

  it('is marked non-cacheable so identical inputs re-run server-side', () => {
    // microcompact would otherwise replace the second call with a
    // back-reference and the user wouldn't get a fresh Blob URL.
    expect(composePdfTool.cacheable).toBe(false);
  });
});

// ─── Preflight (G3) ──────────────────────────────────────────────────

describe('composePdfTool — preflight (G3 input bounds)', () => {
  it('rejects empty pages array', () => {
    const result = composePdfTool.preflight!({ pages: [] });
    expect(result.valid).toBe(false);
    expect(
      result.valid === false && 'error' in result ? result.error : '',
    ).toMatch(/non-empty/i);
  });

  it('rejects non-array pages', () => {
    const result = composePdfTool.preflight!({ pages: 'not-an-array' });
    expect(result.valid).toBe(false);
  });

  it('rejects pages.length > 50 (max)', () => {
    const tooMany = Array.from({ length: 51 }, () => ({
      type: 'text' as const,
      content: 'x',
    }));
    const result = composePdfTool.preflight!({ pages: tooMany });
    expect(result.valid).toBe(false);
    expect(
      result.valid === false && 'error' in result ? result.error : '',
    ).toMatch(/50/);
  });

  it('accepts exactly 50 pages (boundary)', () => {
    const exactly50 = Array.from({ length: 50 }, () => ({
      type: 'text' as const,
      content: 'x',
    }));
    expect(composePdfTool.preflight!({ pages: exactly50 }).valid).toBe(true);
  });

  it('accepts a single page (lower bound)', () => {
    expect(
      composePdfTool.preflight!({
        pages: [{ type: 'text', content: 'x' }],
      }).valid,
    ).toBe(true);
  });

  it('rejects filename longer than 80 chars', () => {
    const result = composePdfTool.preflight!({
      pages: [{ type: 'text', content: 'x' }],
      filename: 'a'.repeat(81),
    });
    expect(result.valid).toBe(false);
  });
});

// ─── Schema validation ────────────────────────────────────────────────

describe('composePdfTool — input schema (Zod-level)', () => {
  it('rejects an image page without a URL', () => {
    const parsed = composePdfTool.inputSchema.safeParse({
      pages: [{ type: 'image' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an image URL that is not an http(s) URL', () => {
    const parsed = composePdfTool.inputSchema.safeParse({
      pages: [{ type: 'image', url: 'not-a-url' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a text page with empty content', () => {
    const parsed = composePdfTool.inputSchema.safeParse({
      pages: [{ type: 'text', content: '' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a mixed image+text input', () => {
    const parsed = composePdfTool.inputSchema.safeParse({
      pages: [
        { type: 'image', url: 'https://example.com/x.png' },
        { type: 'text', content: 'Hello' },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

// ─── Storage / configuration error path ──────────────────────────────

describe('composePdfTool.call — Blob configuration', () => {
  it('throws a clear operator message when BLOB_READ_WRITE_TOKEN is unset', async () => {
    mockEnv.BLOB_READ_WRITE_TOKEN = undefined;

    await expect(
      composePdfTool.call!(
        { pages: [{ type: 'text', content: 'Hello' }] },
        ctx(),
      ),
    ).rejects.toThrow(/Blob/i);

    // The error must mention the operator-actionable fix path so
    // someone reading the prod log stack-trace doesn't have to chase
    // it through the spec.
    await expect(
      composePdfTool.call!(
        { pages: [{ type: 'text', content: 'Hello' }] },
        ctx(),
      ),
    ).rejects.toThrow(/Vercel Blob/);

    expect(mockPut).not.toHaveBeenCalled();
  });
});

// ─── Image pages (G1) ────────────────────────────────────────────────

describe('composePdfTool.call — image pages', () => {
  it('embeds a PNG image into a single PDF page', async () => {
    const result = await composePdfTool.call!(
      {
        pages: [{ type: 'image', url: 'https://example.com/x.png' }],
      },
      ctx(),
    );

    const data = result.data as { pageCount: number; url: string };
    expect(data.pageCount).toBe(1);
    expect(data.url).toBe(
      'https://blob.vercel-storage.com/audric-test-abc123.pdf',
    );
  });

  it('embeds a JPEG when PNG decode fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => tinyJpegBytes().buffer,
      })),
    );

    const result = await composePdfTool.call!(
      { pages: [{ type: 'image', url: 'https://example.com/x.jpg' }] },
      ctx(),
    );

    expect((result.data as { pageCount: number }).pageCount).toBe(1);
  });

  it('rejects an image URL that returns a non-image body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new TextEncoder().encode('not an image').buffer,
      })),
    );

    await expect(
      composePdfTool.call!(
        { pages: [{ type: 'image', url: 'https://example.com/x.bin' }] },
        ctx(),
      ),
    ).rejects.toThrow(/PNG or JPEG/i);
  });

  it('rejects when the image URL fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    );

    await expect(
      composePdfTool.call!(
        { pages: [{ type: 'image', url: 'https://example.com/missing.png' }] },
        ctx(),
      ),
    ).rejects.toThrow(/Failed to fetch image/i);
  });

  it('surfaces a clean timeout message when the image fetch hangs past the 15s cap', async () => {
    // The tool wraps each fetch in `AbortSignal.timeout(15_000)`; when
    // that fires, fetch throws a DOMException with name 'TimeoutError'.
    // We don't actually wait 15s in the test — we synthesize the
    // exception directly so the catch branch's "timed out after 15s"
    // message gets exercised. This pins the user-facing copy so a
    // future timeout-cap change doesn't silently regress the error UX.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'TimeoutError');
      }),
    );

    await expect(
      composePdfTool.call!(
        { pages: [{ type: 'image', url: 'https://slow-vendor.example.com/x.png' }] },
        ctx(),
      ),
    ).rejects.toThrow(/timed out after 15s/i);
  });

  it('renders an image page with a caption (no throw)', async () => {
    const result = await composePdfTool.call!(
      {
        pages: [
          {
            type: 'image',
            url: 'https://example.com/x.png',
            caption: 'A 1×1 transparent pixel — the test fixture',
          },
        ],
      },
      ctx(),
    );
    expect((result.data as { pageCount: number }).pageCount).toBe(1);
  });
});

// ─── Text pages (G1) ─────────────────────────────────────────────────

describe('composePdfTool.call — text pages', () => {
  it('renders a single short text page', async () => {
    const result = await composePdfTool.call!(
      { pages: [{ type: 'text', content: 'Hello world.' }] },
      ctx(),
    );

    expect((result.data as { pageCount: number }).pageCount).toBe(1);
  });

  it('renders a text page with a title', async () => {
    const result = await composePdfTool.call!(
      {
        pages: [
          { type: 'text', title: 'Chapter 1', content: 'Once upon a time…' },
        ],
      },
      ctx(),
    );
    expect((result.data as { pageCount: number }).pageCount).toBe(1);
  });

  it('overflows long text onto continuation pages without throwing', async () => {
    // The pageCount in the tool result is the LOGICAL page count (one
    // input page = one entry in `pages`). Continuation pages produced
    // by overflow are an internal detail of pdf-lib output; we verify
    // the SAVED PDF parses with > 1 physical page to confirm overflow
    // happened.
    const longBody = Array.from({ length: 200 }, (_, i) =>
      `Line ${i}: lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt`,
    ).join('\n');

    const result = await composePdfTool.call!(
      { pages: [{ type: 'text', content: longBody }] },
      ctx(),
    );

    // Logical page count from the tool surface matches input.
    expect((result.data as { pageCount: number }).pageCount).toBe(1);

    // Inspect the actual bytes that went to Blob — the second positional
    // arg to `put`. It MUST parse as a valid PDF with multiple physical
    // pages because the long body wrapped past the first page's bottom.
    const uploadedBytes = mockPut.mock.calls[0][1] as Uint8Array;
    const reloaded = await PDFDocument.load(uploadedBytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });

  it('handles content with explicit newlines as hard line breaks', async () => {
    const content = 'Line A\n\nLine C (skipped Line B blank)';
    await composePdfTool.call!(
      { pages: [{ type: 'text', content }] },
      ctx(),
    );

    const uploadedBytes = mockPut.mock.calls[0][1] as Uint8Array;
    const reloaded = await PDFDocument.load(uploadedBytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
});

// ─── Markdown pages (P3) ─────────────────────────────────────────────

describe('composePdfTool.call — markdown pages (P3)', () => {
  it('accepts a markdown page in the schema', () => {
    const parsed = composePdfTool.inputSchema.safeParse({
      pages: [{ type: 'markdown', content: '# Hello\n\nA paragraph.' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty markdown content', () => {
    const parsed = composePdfTool.inputSchema.safeParse({
      pages: [{ type: 'markdown', content: '' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('renders a single markdown page with headings + paragraph + list', async () => {
    const md = [
      '# Title',
      '',
      'Intro paragraph.',
      '',
      '## Section',
      '',
      '- bullet one',
      '- bullet two',
      '- bullet three',
    ].join('\n');

    const result = await composePdfTool.call!(
      { pages: [{ type: 'markdown', content: md }] },
      ctx(),
    );

    expect((result.data as { pageCount: number }).pageCount).toBe(1);

    // Re-parse the uploaded bytes; assert it's a valid PDF with ≥1 page.
    const body = mockPut.mock.calls[0][1] as Uint8Array;
    const reloaded = await PDFDocument.load(body);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('handles ordered lists with auto-incrementing numbers', async () => {
    const md = [
      '# Ranked items',
      '',
      '1. first',
      '2. second',
      '3. third',
    ].join('\n');

    await composePdfTool.call!(
      { pages: [{ type: 'markdown', content: md }] },
      ctx(),
    );
    // No throw → success. Visual ordering verified by founder smoke (P7).
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('overflows long markdown content onto multiple physical pages', async () => {
    // Construct 100 paragraphs to force overflow.
    const md = Array.from({ length: 100 }, (_, i) =>
      `## Section ${i}\n\nThis is paragraph ${i} content that goes for a while to fill space.`,
    ).join('\n\n');

    await composePdfTool.call!(
      { pages: [{ type: 'markdown', content: md }] },
      ctx(),
    );

    const body = mockPut.mock.calls[0][1] as Uint8Array;
    const reloaded = await PDFDocument.load(body);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });

  it('skips unsupported markdown blocks (tables) without throwing', async () => {
    const md = [
      '# Table test',
      '',
      '| Col A | Col B |',
      '| ----- | ----- |',
      '| a1    | b1    |',
      '',
      'After table.',
    ].join('\n');

    await composePdfTool.call!(
      { pages: [{ type: 'markdown', content: md }] },
      ctx(),
    );
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('escapes HTML in markdown source (no html: true)', async () => {
    // Defensive — if a future contributor flips `html: true` on the
    // markdown-it instance, LLM-supplied markdown could inject script
    // tags. md.parse() with html: false treats raw HTML as text.
    const md = '<script>alert("x")</script>';

    await composePdfTool.call!(
      { pages: [{ type: 'markdown', content: md }] },
      ctx(),
    );
    expect(mockPut).toHaveBeenCalledTimes(1);
    // The parser may produce zero block tokens for a pure <script> line;
    // the test is the no-throw + the still-valid PDF.
    const body = mockPut.mock.calls[0][1] as Uint8Array;
    const reloaded = await PDFDocument.load(body);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders blockquotes with > prefix', async () => {
    const md = '# Quote test\n\n> A famous quote.';

    await composePdfTool.call!(
      { pages: [{ type: 'markdown', content: md }] },
      ctx(),
    );
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('accepts mixed image + text + markdown pages in one PDF', async () => {
    const result = await composePdfTool.call!(
      {
        pages: [
          { type: 'text', title: 'Cover', content: 'My report' },
          { type: 'markdown', content: '# Findings\n\n- Point A\n- Point B' },
          { type: 'image', url: 'https://example.com/x.png' },
        ],
      },
      ctx(),
    );

    expect((result.data as { pageCount: number }).pageCount).toBe(3);
  });
});

// ─── Mixed input + Blob upload integration (G1, G4) ──────────────────

describe('composePdfTool.call — Blob upload contract', () => {
  it('uploads with content-type application/pdf + addRandomSuffix', async () => {
    await composePdfTool.call!(
      {
        pages: [
          { type: 'text', title: 'Mix', content: 'Text + image follows' },
          { type: 'image', url: 'https://example.com/x.png' },
        ],
      },
      ctx(),
    );

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [filename, body, options] = mockPut.mock.calls[0];

    // Default filename has the `audric-<timestamp>.pdf` shape.
    expect(filename).toMatch(/^audric-\d+\.pdf$/);

    // Body must be Uint8Array PDF bytes, parseable by pdf-lib.
    expect(body).toBeInstanceOf(Uint8Array);
    const parsed = await PDFDocument.load(body as Uint8Array);
    expect(parsed.getPageCount()).toBe(2);

    expect(options).toMatchObject({
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
    });
  });

  it('honors a custom filename and adds .pdf if missing', async () => {
    await composePdfTool.call!(
      {
        pages: [{ type: 'text', content: 'x' }],
        filename: 'my-report',
      },
      ctx(),
    );
    expect(mockPut.mock.calls[0][0]).toBe('my-report.pdf');
  });

  it('honors a custom filename that already includes .pdf', async () => {
    await composePdfTool.call!(
      {
        pages: [{ type: 'text', content: 'x' }],
        filename: 'my-report.pdf',
      },
      ctx(),
    );
    expect(mockPut.mock.calls[0][0]).toBe('my-report.pdf');
  });

  it('renders Letter page size when requested', async () => {
    await composePdfTool.call!(
      { pages: [{ type: 'text', content: 'x' }], pageSize: 'Letter' },
      ctx(),
    );

    const body = mockPut.mock.calls[0][1] as Uint8Array;
    const reloaded = await PDFDocument.load(body);
    const page = reloaded.getPage(0);
    expect(page.getWidth()).toBeCloseTo(612, 1); // Letter width
    expect(page.getHeight()).toBeCloseTo(792, 1); // Letter height
  });

  it('renders A4 page size by default', async () => {
    await composePdfTool.call!(
      { pages: [{ type: 'text', content: 'x' }] },
      ctx(),
    );

    const body = mockPut.mock.calls[0][1] as Uint8Array;
    const reloaded = await PDFDocument.load(body);
    const page = reloaded.getPage(0);
    expect(page.getWidth()).toBeCloseTo(595.28, 0); // A4 width
    expect(page.getHeight()).toBeCloseTo(841.89, 0); // A4 height
  });
});

// ─── Tool result shape (D-2 expiry, displayText) ─────────────────────

describe('composePdfTool.call — result shape', () => {
  it('returns 7-day expiresAt (D-2 lock)', async () => {
    const before = Date.now();
    const result = await composePdfTool.call!(
      { pages: [{ type: 'text', content: 'x' }] },
      ctx(),
    );
    const after = Date.now();

    const expiresMs = new Date(
      (result.data as { expiresAt: string }).expiresAt,
    ).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    // Expiry should be ~now + 7 days, with a small buffer for clock
    // tick during the call.
    expect(expiresMs - before).toBeGreaterThanOrEqual(sevenDays - 1000);
    expect(expiresMs - after).toBeLessThanOrEqual(sevenDays + 1000);
  });

  it('returns sizeKb derived from the actual PDF byte length', async () => {
    const result = await composePdfTool.call!(
      { pages: [{ type: 'text', content: 'x' }] },
      ctx(),
    );

    const data = result.data as { sizeKb: number };
    const uploadedBytes = mockPut.mock.calls[0][1] as Uint8Array;
    expect(data.sizeKb).toBe(Math.ceil(uploadedBytes.length / 1024));
  });

  it('returns a displayText that mentions page count + size', async () => {
    const result = await composePdfTool.call!(
      {
        pages: [
          { type: 'text', content: 'page 1' },
          { type: 'text', content: 'page 2' },
          { type: 'text', content: 'page 3' },
        ],
      },
      ctx(),
    );

    expect(result.displayText).toMatch(/3-page PDF/);
    expect(result.displayText).toMatch(/KB/);
    expect(result.displayText).toMatch(/7 days/);
  });
});
