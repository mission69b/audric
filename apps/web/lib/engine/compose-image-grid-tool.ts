import { defineTool } from "@t2000/engine";
import type { ToolContext } from "@t2000/engine";
import { z } from "zod";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { env } from "@/lib/env";

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
 * `'auto'` (default) picks the most-square layout by image count:
 *
 * | N images | auto layout |
 * |----------|-------------|
 * |    2     |     2x1     |
 * |   3-4    |     2x2     |
 * |   5-6    |     3x2     |
 * |   7-9    |     3x3     |
 *
 * Naming convention: `'cols x rows'`. So `'2x1'` is 2 columns × 1 row
 * (a side-by-side pair); `'3x1'` is 3 columns × 1 row (a horizontal
 * row of 3); `'2x2'` is 2 columns × 2 rows (a square 4-tile grid).
 *
 * Empty cells (e.g. 3 images in a 2x2 layout) are filled with white.
 * Grid cells are square; source images are resized with `fit: 'cover'`
 * to fill the cell without letterboxing.
 *
 * ## Single-row layouts (added 2026-05-13 SPEC 23C smoke followup)
 * `'3x1'` and `'4x1'` were added when the founder smoked
 * "3-column grid" with 3 images and got `'2x2'` with a blank cell —
 * `pickAutoLayout` picks the most-square arrangement by default,
 * which is wrong for explicit row prompts. The LLM picks `'3x1'` /
 * `'4x1'` when the user asks for "row" / "3-column" / "side-by-side"
 * phrasing; auto-pick still favors square layouts because that's the
 * better default for a "make me a collage of N images" prompt.
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
const DEFAULT_FORMAT = "webp" as const;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

type Layout = "2x1" | "3x1" | "4x1" | "2x2" | "3x2" | "3x3";

const LAYOUT_CAPACITY: Record<
  Layout,
  { cols: number; rows: number; max: number }
> = {
  "2x1": { cols: 2, rows: 1, max: 2 },
  "3x1": { cols: 3, rows: 1, max: 3 },
  "4x1": { cols: 4, rows: 1, max: 4 },
  "2x2": { cols: 2, rows: 2, max: 4 },
  "3x2": { cols: 3, rows: 2, max: 6 },
  "3x3": { cols: 3, rows: 3, max: 9 },
};

const LAYOUT_VALUES: readonly (Layout | "auto")[] = [
  "2x1",
  "3x1",
  "4x1",
  "2x2",
  "3x2",
  "3x3",
  "auto",
] as const;

function pickAutoLayout(n: number): Layout {
  if (n <= 2) return "2x1";
  if (n <= 4) return "2x2";
  if (n <= 6) return "3x2";
  return "3x3";
}

export const composeImageGridTool = defineTool({
  name: "compose_image_grid",
  description:
    "Compose 2-9 images into a single grid image. Available layouts: " +
    "'2x1' (side-by-side pair), '3x1' (row of 3), '4x1' (row of 4), " +
    "'2x2' (square 4-tile), '3x2' (3-col, 2-row), '3x3' (square 9-tile), " +
    "or 'auto' (default — picks the most-square layout by image count). " +
    "Naming is cols x rows. " +
    "Use '3x1' / '4x1' when the user explicitly asks for 'row', 'N-column', " +
    "or 'side-by-side'. Use 'auto' (or omit) for collage / grid prompts. " +
    "Use when the user wants images side-by-side or in a collage rather than bound " +
    "into a PDF. FREE, server-side. Returns a Vercel Blob URL valid for 7 days. " +
    "Default format is webp (smaller than png, universal browser support).",
  inputSchema: z.object({
    images: z
      .array(
        z.string().url("Each image must be a fully-qualified http(s):// URL"),
      )
      .min(MIN_IMAGES, `images must contain at least ${MIN_IMAGES} URLs`)
      .max(MAX_IMAGES, `images cannot exceed ${MAX_IMAGES} URLs`)
      .describe("Ordered list of 2-9 image URLs to composite into a grid"),
    layout: z
      .enum(["2x1", "3x1", "4x1", "2x2", "3x2", "3x3", "auto"])
      .optional()
      .describe(
        "Grid layout (cols x rows). 'auto' (default) picks the most-square arrangement: 2→2x1, 3-4→2x2, 5-6→3x2, 7-9→3x3. " +
          "Pick '3x1' or '4x1' explicitly for 'row' / 'N-column' / 'side-by-side' prompts.",
      ),
    format: z
      .enum(["png", "webp"])
      .optional()
      .describe(
        "Output format. 'webp' (default) is smaller; 'png' is universal.",
      ),
  }),
  isReadOnly: false,
  permissionLevel: "auto",
  cacheable: false,
  maxResultSizeChars: 2_000,

  preflight: (rawInput) => {
    const input = rawInput as { images?: unknown };
    if (!Array.isArray(input.images)) {
      return { valid: false, error: "images must be an array" };
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
        "Image grid storage not configured (BLOB_READ_WRITE_TOKEN unset). " +
          "Operator: connect Vercel Blob to the project (Project → Storage → Blob → Connect).",
      );
    }

    // Resolve layout. If 'auto' or undefined, pick by image count.
    const requestedLayout =
      input.layout && input.layout !== "auto"
        ? input.layout
        : pickAutoLayout(input.images.length);

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
    //
    // 15s per-image timeout. With Promise.all + a hung CDN, the whole
    // grid would otherwise block until Vercel's serverless function
    // limit. Per-image timeout means a single slow URL fails fast and
    // surfaces a clean "image N timed out" error to the LLM instead of
    // an opaque function-level 504.
    const cells = await Promise.all(
      input.images.map(async (url, i) => {
        let res: Response;
        try {
          res = await fetch(url, {
            signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
          });
        } catch (err) {
          const isTimeout =
            err instanceof DOMException && err.name === "TimeoutError";
          throw new Error(
            isTimeout
              ? `Image ${i + 1} fetch timed out after ${IMAGE_FETCH_TIMEOUT_MS / 1000}s: ${url}`
              : `Failed to fetch image ${i + 1} at ${url}: ${(err as Error).message}`,
          );
        }
        if (!res.ok) {
          throw new Error(
            `Failed to fetch image ${i + 1} at ${url}: ${res.status} ${res.statusText}`,
          );
        }
        const buf = Buffer.from(await res.arrayBuffer());
        try {
          return await sharp(buf)
            .resize(CELL_PX, CELL_PX, { fit: "cover" })
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

    composite =
      format === "png" ? composite.png() : composite.webp({ quality: 85 });
    const outputBytes = await composite.toBuffer();

    const filename = `audric-grid-${Date.now()}.${format}`;
    const uploaded = await put(filename, outputBytes, {
      access: "public",
      contentType: format === "png" ? "image/png" : "image/webp",
      addRandomSuffix: true,
    });

    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
    const sizeKb = Math.ceil(outputBytes.length / 1024);

    console.log({
      kind: "compose_image_grid",
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
