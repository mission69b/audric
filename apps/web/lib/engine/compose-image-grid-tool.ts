import { buildTool } from '@t2000/engine';
import type { ToolContext } from '@t2000/engine';
import { z } from 'zod';
import sharp from 'sharp';
import { put } from '@vercel/blob';
import { env } from '@/lib/env';

/**
 * # `compose_image_grid` — server-side image grid composition tool
 *
 * Companion to `compose_pdf` for the case where the user wants N images
 * laid out side-by-side (e.g. "compile these 4 DALL-E generations into
 * a 2x2 collage") rather than bound into a multi-page PDF.
 *
 * ## Why this exists
 * Same rationale as `compose_pdf` (see that file's header for the SPEC
 * 24 whale-book post-mortem). Routing image-stitching through a gateway
 * MPP service would charge the user, take longer (gateway RTT), and
 * could fail with a vendor 400 — none of which are necessary when
 * Audric already holds the image URLs and can fetch + composite
 * server-side for free.
 *
 * ## Layout
 * `'auto'` (default) picks by image count:
 *
 * | N images | layout |
 * |----------|--------|
 * |    2     |   2x1  |
 * |   3-4    |   2x2  |
 * |   5-6    |   3x2  |
 * |   7-9    |   3x3  |
 *
 * Empty cells (e.g. 3 images in a 2x2 layout) are filled with white.
 * Grid cells are square; source images are resized with `fit: 'cover'`
 * to fill the cell without letterboxing.
 *
 * ## Why sharp
 * Industry-standard Node image processing. Native binary (~5MB)
 * provides 5-10x speedup over pure-JS alternatives like jimp, which
 * matters for the 9-image case where we'd otherwise burn 200-300ms
 * on resize work alone. Vercel serverless ships sharp's prebuilt
 * binaries automatically.
 *
 * ## Permission
 * `auto`. No funds move. Bounded compute via the 9-image cap.
 */

const MIN_IMAGES = 2;
const MAX_IMAGES = 9;
const CELL_PX = 512; // each grid cell is 512x512 → max output 1536x1536 (3x3)
const DEFAULT_FORMAT = 'webp' as const;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

type Layout = '2x1' | '2x2' | '3x2' | '3x3';

const LAYOUT_CAPACITY: Record<Layout, { cols: number; rows: number; max: number }> = {
  '2x1': { cols: 2, rows: 1, max: 2 },
  '2x2': { cols: 2, rows: 2, max: 4 },
  '3x2': { cols: 3, rows: 2, max: 6 },
  '3x3': { cols: 3, rows: 3, max: 9 },
};

function pickAutoLayout(n: number): Layout {
  if (n <= 2) return '2x1';
  if (n <= 4) return '2x2';
  if (n <= 6) return '3x2';
  return '3x3';
}

export const composeImageGridTool = buildTool({
  name: 'compose_image_grid',
  description:
    'Compose 2-9 images into a single grid image (2x1, 2x2, 3x2, or 3x3 layout). ' +
    'Use when the user wants images side-by-side or in a collage rather than bound ' +
    "into a PDF. FREE, server-side. Returns a Vercel Blob URL valid for 7 days. " +
    "Default layout is 'auto' (picks by image count). Default format is webp (smaller " +
    'than png, universal browser support).',
  inputSchema: z.object({
    images: z
      .array(
        z
          .string()
          .url('Each image must be a fully-qualified http(s):// URL'),
      )
      .min(MIN_IMAGES, `images must contain at least ${MIN_IMAGES} URLs`)
      .max(MAX_IMAGES, `images cannot exceed ${MAX_IMAGES} URLs`)
      .describe('Ordered list of 2-9 image URLs to composite into a grid'),
    layout: z
      .enum(['2x2', '3x2', '3x3', 'auto'])
      .optional()
      .describe(
        "Grid layout. 'auto' (default) picks by image count: 2→2x1, 3-4→2x2, 5-6→3x2, 7-9→3x3.",
      ),
    format: z
      .enum(['png', 'webp'])
      .optional()
      .describe("Output format. 'webp' (default) is smaller; 'png' is universal."),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      images: {
        type: 'array',
        items: { type: 'string' },
        minItems: MIN_IMAGES,
        maxItems: MAX_IMAGES,
      },
      layout: { type: 'string', enum: ['2x2', '3x2', '3x3', 'auto'] },
      format: { type: 'string', enum: ['png', 'webp'] },
    },
    required: ['images'],
  },
  isReadOnly: false,
  permissionLevel: 'auto',
  cacheable: false,
  maxResultSizeChars: 2_000,

  preflight: (rawInput) => {
    const input = rawInput as { images?: unknown };
    if (!Array.isArray(input.images)) {
      return { valid: false, error: 'images must be an array' };
    }
    if (input.images.length < MIN_IMAGES) {
      return {
        valid: false,
        error: `images must contain at least ${MIN_IMAGES} URLs`,
      };
    }
    if (input.images.length > MAX_IMAGES) {
      return {
        valid: false,
        error: `images cannot exceed ${MAX_IMAGES} URLs (got ${input.images.length})`,
      };
    }
    return { valid: true };
  },

  call: async (input, context: ToolContext) => {
    void context;

    if (!env.BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        'Image grid storage not configured (BLOB_READ_WRITE_TOKEN unset). ' +
          'Operator: connect Vercel Blob to the project (Project → Storage → Blob → Connect).',
      );
    }

    // Resolve layout. If 'auto' or undefined, pick by image count.
    const requestedLayout =
      input.layout && input.layout !== 'auto' ? input.layout : pickAutoLayout(input.images.length);

    // Validate that the requested layout has enough cells. If a user
    // explicitly asks for 2x2 with 5 images, that's a misuse — fail
    // loudly rather than silently dropping the trailing image.
    const capacity = LAYOUT_CAPACITY[requestedLayout];
    if (input.images.length > capacity.max) {
      throw new Error(
        `Layout ${requestedLayout} has ${capacity.max} cells but ${input.images.length} images were provided. ` +
          `Use 'auto' or a larger layout.`,
      );
    }

    const format = input.format ?? DEFAULT_FORMAT;
    const { cols, rows } = capacity;
    const outputWidth = cols * CELL_PX;
    const outputHeight = rows * CELL_PX;

    // Fetch + resize each source image to CELL_PX × CELL_PX. We do this
    // in parallel because each fetch is independent. `fit: 'cover'`
    // crops to fill the square cell without letterboxing.
    const cells = await Promise.all(
      input.images.map(async (url, i) => {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch image ${i + 1} at ${url}: ${res.status} ${res.statusText}`,
          );
        }
        const buf = Buffer.from(await res.arrayBuffer());
        try {
          return await sharp(buf)
            .resize(CELL_PX, CELL_PX, { fit: 'cover' })
            .toBuffer();
        } catch (err) {
          throw new Error(
            `Image ${i + 1} at ${url} could not be decoded by sharp: ${(err as Error).message}`,
          );
        }
      }),
    );

    // Composite the cells onto a white background. Sharp's `composite`
    // takes an array of overlay specs with explicit `top` / `left` per
    // cell. White background means empty cells (e.g. 3 images in a 2x2
    // layout) render as clean white squares rather than transparency.
    const composites = cells.map((cell, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        input: cell,
        top: row * CELL_PX,
        left: col * CELL_PX,
      };
    });

    let composite = sharp({
      create: {
        width: outputWidth,
        height: outputHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).composite(composites);

    composite = format === 'png' ? composite.png() : composite.webp({ quality: 85 });
    const outputBytes = await composite.toBuffer();

    const filename = `audric-grid-${Date.now()}.${format}`;
    const uploaded = await put(filename, outputBytes, {
      access: 'public',
      contentType: format === 'png' ? 'image/png' : 'image/webp',
      addRandomSuffix: true,
    });

    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
    const sizeKb = Math.ceil(outputBytes.length / 1024);

    console.log({
      kind: 'compose_image_grid',
      imageCount: input.images.length,
      layout: requestedLayout,
      format,
      sizeKb,
    });

    return {
      data: {
        url: uploaded.url,
        layout: requestedLayout,
        width: outputWidth,
        height: outputHeight,
        sizeKb,
        expiresAt,
      },
      displayText: `Composed ${input.images.length} images into a ${requestedLayout} ${format.toUpperCase()} grid (${outputWidth}×${outputHeight}, ${sizeKb} KB). Available for 7 days.`,
    };
  },
});
