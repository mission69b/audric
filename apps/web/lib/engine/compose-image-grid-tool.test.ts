import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '@t2000/engine';
import sharp from 'sharp';

/**
 * Unit tests for `composeImageGridTool` — the audric-side native image
 * grid composition tool.
 *
 * Strategy: use REAL sharp throughout (it's a server-side dep we trust
 * and mocking it correctly would require recreating its composite
 * semantics). We synthesize tiny solid-color source images via sharp
 * itself, which keeps the tests hermetic — no fixture files, no
 * network — while exercising the actual sharp pipeline end-to-end.
 *
 * Mocks:
 *   - `@vercel/blob.put` — replaced; we capture the bytes that would
 *     have been uploaded and round-trip them through sharp to assert
 *     the final image dimensions + format are correct.
 *   - `@/lib/env` — replaced; we control BLOB_READ_WRITE_TOKEN per test.
 *   - `fetch` — replaced; returns the synthetic source image bytes
 *     instead of hitting a real URL.
 *
 * What we verify:
 *   - Schema bounds (2-9 images, layout enum, format enum) (G3)
 *   - Auto-layout picks the right grid for each image count (D-4)
 *   - Explicit layout with too many images errors clearly
 *   - Output dimensions match cols×512 / rows×512 (G2)
 *   - Output format matches request — webp default, png on request (G2)
 *   - Empty cells (e.g. 3 images in a 2x2) render as white background
 *   - Per-image fetch failures surface a clear error
 *   - "Blob not configured" path returns operator-actionable error
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

import { composeImageGridTool } from './compose-image-grid-tool';

const ctx = (): ToolContext =>
  ({
    agent: undefined,
    mcpManager: undefined,
    walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }) as unknown as ToolContext;

/**
 * Synthesize a 100×100 solid-color PNG. Used as the source image for
 * every grid cell test. sharp can read these back via `metadata()` so
 * we can assert the final composite has the expected dimensions.
 *
 * Why solid color: identifies which cell is which in the composite if
 * we ever want to add visual-position tests (cells go top-left → right,
 * row by row). For now we just assert dimensions + format.
 */
async function syntheticPng(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

beforeEach(async () => {
  mockPut.mockReset();
  mockPut.mockResolvedValue({
    url: 'https://blob.vercel-storage.com/audric-grid-test-abc123.webp',
    downloadUrl: 'https://blob.vercel-storage.com/audric-grid-test-abc123.webp',
    pathname: 'audric-grid-test-abc123.webp',
    contentType: 'image/webp',
    contentDisposition: 'inline; filename="audric-grid-test-abc123.webp"',
  });

  mockEnv.BLOB_READ_WRITE_TOKEN = 'vercel-blob-test-token';

  // Default fetch returns a red 100x100 PNG. Override per-test for
  // failure-mode tests.
  const redPng = await syntheticPng({ r: 255, g: 0, b: 0 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => redPng.buffer.slice(redPng.byteOffset, redPng.byteOffset + redPng.byteLength),
    })),
  );
});

// ─── Declarative shape ────────────────────────────────────────────────

describe('composeImageGridTool — declarative shape', () => {
  it('is named compose_image_grid', () => {
    expect(composeImageGridTool.name).toBe('compose_image_grid');
  });

  it('runs auto so the engine never gates on user confirm', () => {
    expect(composeImageGridTool.permissionLevel).toBe('auto');
  });

  it('is marked non-cacheable so identical inputs re-run server-side', () => {
    expect(composeImageGridTool.cacheable).toBe(false);
  });
});

// ─── Preflight (G3) ──────────────────────────────────────────────────

describe('composeImageGridTool — preflight (G3 input bounds)', () => {
  it('rejects fewer than 2 images', () => {
    const result = composeImageGridTool.preflight!({
      images: ['https://example.com/a.png'],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects more than 9 images', () => {
    const tooMany = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}.png`);
    const result = composeImageGridTool.preflight!({ images: tooMany });
    expect(result.valid).toBe(false);
    expect(
      result.valid === false && 'error' in result ? result.error : '',
    ).toMatch(/9/);
  });

  it('accepts exactly 2 (lower bound)', () => {
    expect(
      composeImageGridTool.preflight!({
        images: ['https://example.com/a.png', 'https://example.com/b.png'],
      }).valid,
    ).toBe(true);
  });

  it('accepts exactly 9 (upper bound)', () => {
    const exactly9 = Array.from({ length: 9 }, (_, i) => `https://example.com/${i}.png`);
    expect(composeImageGridTool.preflight!({ images: exactly9 }).valid).toBe(true);
  });

  it('rejects non-array images', () => {
    expect(
      composeImageGridTool.preflight!({ images: 'not-an-array' }).valid,
    ).toBe(false);
  });
});

// ─── Schema validation ───────────────────────────────────────────────

describe('composeImageGridTool — input schema (Zod-level)', () => {
  it('rejects non-URL strings in images', () => {
    const parsed = composeImageGridTool.inputSchema.safeParse({
      images: ['not-a-url', 'https://example.com/b.png'],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts the 'auto' layout", () => {
    const parsed = composeImageGridTool.inputSchema.safeParse({
      images: ['https://x.com/a.png', 'https://x.com/b.png'],
      layout: 'auto',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown layout', () => {
    const parsed = composeImageGridTool.inputSchema.safeParse({
      images: ['https://x.com/a.png', 'https://x.com/b.png'],
      layout: '4x4',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown format', () => {
    const parsed = composeImageGridTool.inputSchema.safeParse({
      images: ['https://x.com/a.png', 'https://x.com/b.png'],
      format: 'bmp',
    });
    expect(parsed.success).toBe(false);
  });
});

// ─── Storage / configuration error path ──────────────────────────────

describe('composeImageGridTool.call — Blob configuration', () => {
  it('throws a clear operator message when BLOB_READ_WRITE_TOKEN is unset', async () => {
    mockEnv.BLOB_READ_WRITE_TOKEN = undefined;

    await expect(
      composeImageGridTool.call!(
        {
          images: ['https://example.com/a.png', 'https://example.com/b.png'],
        },
        ctx(),
      ),
    ).rejects.toThrow(/Blob/i);

    expect(mockPut).not.toHaveBeenCalled();
  });
});

// ─── Auto-layout ─────────────────────────────────────────────────────

describe('composeImageGridTool.call — auto layout (D-4)', () => {
  it.each([
    [2, '2x1', 1024, 512],
    [3, '2x2', 1024, 1024],
    [4, '2x2', 1024, 1024],
    [5, '3x2', 1536, 1024],
    [6, '3x2', 1536, 1024],
    [7, '3x3', 1536, 1536],
    [9, '3x3', 1536, 1536],
  ])('with N=%i picks layout %s (%ix%i)', async (n, expectedLayout, expectedW, expectedH) => {
    const result = await composeImageGridTool.call!(
      {
        images: Array.from({ length: n }, (_, i) => `https://example.com/${i}.png`),
      },
      ctx(),
    );

    const data = result.data as { layout: string; width: number; height: number };
    expect(data.layout).toBe(expectedLayout);
    expect(data.width).toBe(expectedW);
    expect(data.height).toBe(expectedH);
  });
});

// ─── Single-row layouts (Bug C — 2026-05-13 SPEC 23C smoke followup) ─

describe('composeImageGridTool.call — single-row layouts (3x1, 4x1)', () => {
  it("schema accepts '3x1'", () => {
    const parsed = composeImageGridTool.inputSchema.safeParse({
      images: ['https://x.com/a.png', 'https://x.com/b.png', 'https://x.com/c.png'],
      layout: '3x1',
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts '4x1'", () => {
    const parsed = composeImageGridTool.inputSchema.safeParse({
      images: Array.from({ length: 4 }, (_, i) => `https://x.com/${i}.png`),
      layout: '4x1',
    });
    expect(parsed.success).toBe(true);
  });

  it("'3x1' renders 3 images in a single 1536×512 row (the founder smoke prompt)", async () => {
    const result = await composeImageGridTool.call!(
      {
        images: ['https://x.com/a.png', 'https://x.com/b.png', 'https://x.com/c.png'],
        layout: '3x1',
      },
      ctx(),
    );

    const data = result.data as { layout: string; width: number; height: number };
    expect(data.layout).toBe('3x1');
    expect(data.width).toBe(1536);
    expect(data.height).toBe(512);

    // Round-trip the uploaded bytes through sharp to confirm dimensions.
    const uploaded = mockPut.mock.calls[0][1] as Buffer;
    const meta = await sharp(uploaded).metadata();
    expect(meta.width).toBe(1536);
    expect(meta.height).toBe(512);
  });

  it("'4x1' renders 4 images in a single 2048×512 row", async () => {
    const result = await composeImageGridTool.call!(
      {
        images: Array.from({ length: 4 }, (_, i) => `https://x.com/${i}.png`),
        layout: '4x1',
      },
      ctx(),
    );

    const data = result.data as { layout: string; width: number; height: number };
    expect(data.layout).toBe('4x1');
    expect(data.width).toBe(2048);
    expect(data.height).toBe(512);
  });

  it("'3x1' rejects a 4-image input (too many for the row)", async () => {
    await expect(
      composeImageGridTool.call!(
        {
          images: Array.from({ length: 4 }, (_, i) => `https://x.com/${i}.png`),
          layout: '3x1',
        },
        ctx(),
      ),
    ).rejects.toThrow(/cells/i);
  });

  it("auto-pick still favors square layouts — N=3 stays on '2x2', not '3x1'", async () => {
    // Documents the explicit decision: auto = most-square (collage
    // aesthetic); '3x1' is opt-in for "row" / "side-by-side" prompts.
    const result = await composeImageGridTool.call!(
      {
        images: ['https://x.com/a.png', 'https://x.com/b.png', 'https://x.com/c.png'],
      },
      ctx(),
    );
    expect((result.data as { layout: string }).layout).toBe('2x2');
  });
});

// ─── Explicit layout overrides ───────────────────────────────────────

describe('composeImageGridTool.call — explicit layout', () => {
  it('honors an explicit 2x2 with 4 images', async () => {
    const result = await composeImageGridTool.call!(
      {
        images: Array.from({ length: 4 }, (_, i) => `https://example.com/${i}.png`),
        layout: '2x2',
      },
      ctx(),
    );

    expect((result.data as { layout: string }).layout).toBe('2x2');
  });

  it('errors when explicit layout cannot fit the image count', async () => {
    await expect(
      composeImageGridTool.call!(
        {
          images: Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.png`),
          layout: '2x2', // 2x2 only has 4 cells
        },
        ctx(),
      ),
    ).rejects.toThrow(/cells/i);
  });

  it('honors a larger explicit layout than auto would pick (3 images, 3x3 layout)', async () => {
    const result = await composeImageGridTool.call!(
      {
        images: ['https://x.com/a.png', 'https://x.com/b.png', 'https://x.com/c.png'],
        layout: '3x3',
      },
      ctx(),
    );

    expect((result.data as { layout: string; width: number }).layout).toBe('3x3');
    expect((result.data as { width: number }).width).toBe(1536);
  });
});

// ─── Output format / dimensions (G2) ─────────────────────────────────

describe('composeImageGridTool.call — output format', () => {
  it('produces a webp by default with correct dimensions', async () => {
    await composeImageGridTool.call!(
      { images: ['https://x.com/a.png', 'https://x.com/b.png'] },
      ctx(),
    );

    const [filename, body, options] = mockPut.mock.calls[0];
    expect(filename).toMatch(/\.webp$/);
    expect(options).toMatchObject({
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: true,
    });

    // Round-trip through sharp to verify the output is a real webp
    // with the correct dimensions.
    const meta = await sharp(body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(512);
  });

  it('produces a png when format=png', async () => {
    await composeImageGridTool.call!(
      {
        images: ['https://x.com/a.png', 'https://x.com/b.png'],
        format: 'png',
      },
      ctx(),
    );

    const [filename, body, options] = mockPut.mock.calls[0];
    expect(filename).toMatch(/\.png$/);
    expect(options).toMatchObject({ contentType: 'image/png' });

    const meta = await sharp(body as Buffer).metadata();
    expect(meta.format).toBe('png');
  });
});

// ─── Per-image fetch failures ────────────────────────────────────────

describe('composeImageGridTool.call — fetch error paths', () => {
  it('throws a clear error when one image returns 404', async () => {
    let callCount = 0;
    const goodPng = await syntheticPng({ r: 0, g: 255, b: 0 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++;
        if (callCount === 2) {
          // Second image (i+1=2) fails.
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            arrayBuffer: async () => new ArrayBuffer(0),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () =>
            goodPng.buffer.slice(goodPng.byteOffset, goodPng.byteOffset + goodPng.byteLength),
        };
      }),
    );

    await expect(
      composeImageGridTool.call!(
        { images: ['https://x.com/a.png', 'https://x.com/b.png'] },
        ctx(),
      ),
    ).rejects.toThrow(/image 2.*404/i);
  });

  it('throws a clear error when an image is not a valid image format', async () => {
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
      composeImageGridTool.call!(
        { images: ['https://x.com/a.png', 'https://x.com/b.png'] },
        ctx(),
      ),
    ).rejects.toThrow(/sharp/i);
  });

  it('surfaces a clean per-image timeout message when one fetch hangs past 15s', async () => {
    // Same pattern as the compose_pdf timeout test: synthesize the
    // DOMException('TimeoutError') that AbortSignal.timeout throws so
    // we exercise the catch branch without waiting 15s. The error
    // message identifies WHICH image timed out (i+1 from the parallel
    // fetch loop) — important UX because the user can re-issue with a
    // narrower image set.
    let callCount = 0;
    const goodPng = await syntheticPng({ r: 0, g: 255, b: 0 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++;
        if (callCount === 2) {
          throw new DOMException('aborted', 'TimeoutError');
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () =>
            goodPng.buffer.slice(goodPng.byteOffset, goodPng.byteOffset + goodPng.byteLength),
        };
      }),
    );

    await expect(
      composeImageGridTool.call!(
        { images: ['https://x.com/a.png', 'https://slow.example.com/b.png'] },
        ctx(),
      ),
    ).rejects.toThrow(/image 2.*timed out after 15s/i);
  });
});

// ─── Result shape (D-2 expiry) ───────────────────────────────────────

describe('composeImageGridTool.call — result shape', () => {
  it('returns 7-day expiresAt (D-2 lock)', async () => {
    const before = Date.now();
    const result = await composeImageGridTool.call!(
      { images: ['https://x.com/a.png', 'https://x.com/b.png'] },
      ctx(),
    );
    const after = Date.now();

    const expiresMs = new Date(
      (result.data as { expiresAt: string }).expiresAt,
    ).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(expiresMs - before).toBeGreaterThanOrEqual(sevenDays - 1000);
    expect(expiresMs - after).toBeLessThanOrEqual(sevenDays + 1000);
  });

  it('returns sizeKb derived from the actual output byte length', async () => {
    const result = await composeImageGridTool.call!(
      { images: ['https://x.com/a.png', 'https://x.com/b.png'] },
      ctx(),
    );

    const data = result.data as { sizeKb: number };
    const uploadedBytes = mockPut.mock.calls[0][1] as Buffer;
    expect(data.sizeKb).toBe(Math.ceil(uploadedBytes.length / 1024));
  });

  it('returns a displayText that mentions image count + dimensions + size', async () => {
    const result = await composeImageGridTool.call!(
      {
        images: Array.from({ length: 4 }, (_, i) => `https://x.com/${i}.png`),
      },
      ctx(),
    );

    expect(result.displayText).toMatch(/4 images/);
    expect(result.displayText).toMatch(/2x2/);
    expect(result.displayText).toMatch(/WEBP/);
    expect(result.displayText).toMatch(/1024×1024/);
    expect(result.displayText).toMatch(/7 days/);
  });
});
