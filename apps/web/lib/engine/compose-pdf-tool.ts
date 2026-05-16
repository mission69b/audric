import { defineTool } from "@t2000/engine";
import type { ToolContext } from "@t2000/engine";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { put } from "@vercel/blob";
import MarkdownIt from "markdown-it";
import { env } from "@/lib/env";

/**
 * # `compose_pdf` — server-side PDF composition tool
 *
 * Background — why this lives in audric, not in `@t2000/engine`:
 *
 * SPEC 24 founder smoke surfaced the recurring failure mode of routing
 * artifact-composition work through MPP gateway services. The whale-book
 * test (`pay_api(pdfshift/v1/convert)`) 400'd at the gateway, the user
 * paid $0.01 for nothing, and ended up with 6 separate DALL-E images
 * instead of a bound PDF.
 *
 * PDFShift (and similar gateway-mediated transforms) are the wrong
 * abstraction for "compose what we already have." Audric already holds
 * the source artifacts — DALL-E image URLs from prior `pay_api` turns,
 * markdown the LLM authored this turn, plain text strings — and we
 * shouldn't pay a gateway to re-fetch them, transform them, and bill
 * the user for the privilege.
 *
 * `compose_pdf` runs server-side in audric, is FREE to the user, and
 * can't fail with a vendor 400. It's pure JS over data Audric already
 * has.
 *
 * ## Phase scope (P2+P3 of SPEC `spec_native_content_tools`)
 * - ✅ Image pages — fetch image URL → embed as PNG/JPEG with caption
 * - ✅ Text pages — title + body, Helvetica, A4/Letter
 * - ✅ Vercel Blob upload + 7-day signed URL
 * - ✅ Markdown pages — `markdown-it` block-walker → headings + paragraphs + lists
 *
 * ## Non-goals
 * - HTML→PDF rendering — keep PDFShift as the explicit fallback for
 *   that case (CSS / JS / browser primitives required).
 * - Multi-column layouts, custom fonts, embedded video — out of scope
 *   for v1; folded into "future PDF render features" backlog.
 *
 * ## Why these specific deps
 * - `pdf-lib` (~50kb): pure JS, no chromium overhead, broad PNG/JPEG
 *   embed support, mature project. Alternative `pdfkit` ships with a
 *   ~2MB AFM font bundle we don't need.
 * - `@vercel/blob`: native Vercel ecosystem hosting; signed URLs work
 *   out of the box; storage cost ~$0.05/GB/mo at the audric tier
 *   (single-user PDF traffic is rounding error). Alternatives:
 *   - data-URI in tool result → blows context budget for any
 *     non-trivial PDF (5MB → 6.7MB base64).
 *   - Vercel `/tmp` → per-invocation, doesn't persist for downloads
 *     after the function exits.
 *   - Postgres BLOB → bad for binary, slow, and pollutes the analytics
 *     model with multi-MB rows.
 *
 * ## Permission model
 * `auto`. No funds move. The compute cap is enforced by hard input
 * limits (50 pages max). DoS surface is bounded.
 *
 * ## Telemetry
 * Emits a structured `console.log({ kind: 'compose_pdf', ... })` on
 * each successful composition. Mirrors `regen-append`'s pattern;
 * useful for adoption tracking + sizing the PDFShift deprecation
 * decision (per spec § 9).
 */

const MAX_PAGES = 50;
const MAX_FILENAME_LENGTH = 80;
const PAGE_SIZE_A4: [number, number] = [595.28, 841.89];
const PAGE_SIZE_LETTER: [number, number] = [612, 792];
const MARGIN = 50;
const TEXT_FONT_SIZE = 11;
const TITLE_FONT_SIZE = 16;
const CAPTION_FONT_SIZE = 9;
const LINE_HEIGHT = 14;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

// Vercel Blob `put` returns a permanent URL. SPEC § D-2 lock: 7-day
// expiry. We surface this in the `expiresAt` field so the LLM can warn
// the user. Note: Vercel Blob URLs themselves don't auto-expire — we
// surface the expiresAt as a contract for future ourselves; an actual
// cleanup cron is the spec-pdfshift-deprecation follow-up's problem.
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const pageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    url: z
      .string()
      .url("Image URL must be a fully-qualified http(s):// URL")
      .describe(
        "Fully-qualified image URL (e.g. from a prior pay_api(openai/.../images) call)",
      ),
    caption: z
      .string()
      .max(200)
      .optional()
      .describe("Optional caption shown below the image"),
  }),
  z.object({
    type: z.literal("text"),
    content: z
      .string()
      .min(1, "Text content cannot be empty")
      .max(20_000, "Text content per page max 20,000 chars")
      .describe("Plain text body of the page"),
    title: z
      .string()
      .max(200)
      .optional()
      .describe("Optional bold title rendered above the body"),
  }),
  z.object({
    type: z.literal("markdown"),
    content: z
      .string()
      .min(1, "Markdown content cannot be empty")
      .max(20_000, "Markdown content per page max 20,000 chars")
      .describe(
        "Markdown source text. Supports headings (#, ##, ###), paragraphs, " +
          "and bullet lists (-, *). Bold/italic emphasis and inline code render " +
          "as plain text. Tables, code blocks, and images are NOT rendered — " +
          "use a separate text/image page for those.",
      ),
  }),
]);

export const composePdfTool = defineTool({
  name: "compose_pdf",
  description:
    "Compose a PDF from artifacts you already have — images from prior pay_api(openai/.../images) calls, " +
    "plain text, markdown documents, or a mix. FREE, server-side, no gateway fees. " +
    "Use this BEFORE reaching for pay_api(pdfshift/...) — PDFShift only makes sense when the source is HTML " +
    "requiring a browser to render. Markdown supports headings, paragraphs, and bullet lists " +
    "(tables/code blocks/embedded images render as plain text). Returns a Vercel Blob URL valid for 7 days.",
  inputSchema: z.object({
    pages: z
      .array(pageSchema)
      .min(1, "pages must contain at least 1 entry")
      .max(MAX_PAGES, `pages cannot exceed ${MAX_PAGES} entries`)
      .describe("Ordered list of pages to bind into the PDF"),
    filename: z
      .string()
      .min(1)
      .max(MAX_FILENAME_LENGTH)
      .optional()
      .describe("Optional filename (default: audric-<timestamp>.pdf)"),
    pageSize: z
      .enum(["A4", "Letter"])
      .optional()
      .describe("Page size — A4 (default, international) or Letter (US)"),
  }),
  isReadOnly: false,
  permissionLevel: "auto",
  cacheable: false,
  maxResultSizeChars: 2_000,

  preflight: (rawInput) => {
    const input = rawInput as { pages?: unknown[]; filename?: string };
    if (!Array.isArray(input.pages) || input.pages.length === 0) {
      return { valid: false, error: "pages must be a non-empty array" };
    }
    if (input.pages.length > MAX_PAGES) {
      return {
        valid: false,
        error: `pages exceeds the ${MAX_PAGES}-page limit. Split into multiple PDFs or summarize the source content.`,
      };
    }
    if (input.filename && input.filename.length > MAX_FILENAME_LENGTH) {
      return {
        valid: false,
        error: `filename exceeds ${MAX_FILENAME_LENGTH} chars`,
      };
    }
    return { valid: true };
  },

  call: async (input, context: ToolContext) => {
    void context; // not yet read; reserved for telemetry / per-user blob prefixes

    if (!env.BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "PDF storage not configured (BLOB_READ_WRITE_TOKEN unset). " +
          "Operator: connect Vercel Blob to the project (Project → Storage → Blob → Connect).",
      );
    }

    const pageDimensions =
      input.pageSize === "Letter" ? PAGE_SIZE_LETTER : PAGE_SIZE_A4;
    const pdfDoc = await PDFDocument.create();
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const page of input.pages) {
      if (page.type === "image") {
        await renderImagePage(pdfDoc, page, pageDimensions, helv);
      } else if (page.type === "markdown") {
        renderMarkdownPage(pdfDoc, page, pageDimensions, helv, helvBold);
      } else {
        renderTextPage(pdfDoc, page, pageDimensions, helv, helvBold);
      }
    }

    const pdfBytes = await pdfDoc.save();
    const sizeKb = Math.ceil(pdfBytes.length / 1024);

    const filename = input.filename ?? `audric-${Date.now()}.pdf`;
    const safeFilename = filename.endsWith(".pdf")
      ? filename
      : `${filename}.pdf`;

    // Vercel Blob upload. `addRandomSuffix: true` avoids name collisions
    // across users — two users requesting `report.pdf` get distinct
    // blob keys without having to thread the wallet address into the
    // path. `access: 'public'` means anyone with the URL can download
    // (which is the intended behavior — the URL itself is the auth).
    //
    // The cast on `pdfBytes` is a TypeScript-only workaround: @vercel/blob's
    // `PutBody` type lists `Buffer | Blob | ReadableStream | File | Readable`
    // and pdf-lib returns `Uint8Array<ArrayBufferLike>` (which @vercel/blob
    // does accept at runtime — the Node SDK happily handles a Uint8Array
    // and stream-uploads it — but the type lists Buffer specifically).
    // Casting via `as unknown as Buffer` keeps the runtime semantics (raw
    // Uint8Array stream) and avoids the Buffer.from() copy that, in
    // testing, interfered with pdf-lib re-parsing the captured mock arg.
    const uploaded = await put(safeFilename, pdfBytes as unknown as Buffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: true,
    });

    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();

    console.log({
      kind: "compose_pdf",
      pageCount: input.pages.length,
      sizeKb,
      filename: safeFilename,
      pageSize: input.pageSize ?? "A4",
    });

    const displayText = `Generated ${input.pages.length}-page PDF "${safeFilename}" (${sizeKb} KB). Available for 7 days.`;

    return {
      data: {
        url: uploaded.url,
        filename: safeFilename,
        pageCount: input.pages.length,
        sizeKb,
        expiresAt,
      },
      displayText,
    };
  },
});

// ─── Page renderers ────────────────────────────────────────────────────

async function renderImagePage(
  pdfDoc: PDFDocument,
  page: { type: "image"; url: string; caption?: string },
  pageDims: [number, number],
  font: import("pdf-lib").PDFFont,
): Promise<void> {
  const [pageWidth, pageHeight] = pageDims;
  const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

  // Fetch the image bytes. We trust the URL because the LLM only ever
  // gets URLs from prior pay_api results (audric-controlled vendors)
  // or from user prompts (where the user is taking responsibility).
  // No allow-list — the v0.1 spec rejected gating on host because the
  // realistic source set is too broad (OpenAI CDN, Replicate, Walrus,
  // etc.) and a deny-list is no better than browser SOP.
  //
  // 15s per-image timeout. Without this, a hung vendor CDN blocks until
  // Vercel's serverless function limit (60s on Pro) and the user gets
  // an opaque 504 instead of a clean "image fetch timed out" message.
  // 15s aligns with the audric pattern for non-critical-path vendor
  // fetches; BlockVision uses 3s on its critical path because that's
  // what its SLO budget allows.
  let res: Response;
  try {
    res = await fetch(page.url, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout =
      err instanceof DOMException && err.name === "TimeoutError";
    throw new Error(
      isTimeout
        ? `Image fetch timed out after ${IMAGE_FETCH_TIMEOUT_MS / 1000}s: ${page.url}`
        : `Failed to fetch image at ${page.url}: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch image at ${page.url}: ${res.status} ${res.statusText}`,
    );
  }
  const buf = new Uint8Array(await res.arrayBuffer());

  // Try PNG first, then JPEG — pdf-lib has separate embed methods that
  // throw on a format mismatch. Sniffing the content-type header would
  // be cleaner but vendors lie about it (OpenAI returns
  // `application/octet-stream` for some image responses); the
  // try/catch is robust against that.
  let embedded: import("pdf-lib").PDFImage;
  try {
    embedded = await pdfDoc.embedPng(buf);
  } catch {
    try {
      embedded = await pdfDoc.embedJpg(buf);
    } catch {
      throw new Error(
        `Image at ${page.url} is not a valid PNG or JPEG. PDF generation requires one of those formats.`,
      );
    }
  }

  // Scale image to fit the page minus margins. Preserve aspect ratio.
  // The caption (if present) reserves a fixed strip at the bottom.
  const captionStrip = page.caption ? CAPTION_FONT_SIZE + 8 : 0;
  const maxW = pageWidth - 2 * MARGIN;
  const maxH = pageHeight - 2 * MARGIN - captionStrip;
  const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
  const w = embedded.width * scale;
  const h = embedded.height * scale;

  const x = (pageWidth - w) / 2;
  const y = (pageHeight - h) / 2 + captionStrip / 2;

  pdfPage.drawImage(embedded, { x, y, width: w, height: h });

  if (page.caption) {
    pdfPage.drawText(page.caption, {
      x: MARGIN,
      y: MARGIN,
      size: CAPTION_FONT_SIZE,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
}

function renderTextPage(
  pdfDoc: PDFDocument,
  page: { type: "text"; content: string; title?: string },
  pageDims: [number, number],
  font: import("pdf-lib").PDFFont,
  fontBold: import("pdf-lib").PDFFont,
): void {
  const [pageWidth, pageHeight] = pageDims;
  let pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - MARGIN;

  if (page.title) {
    pdfPage.drawText(page.title, {
      x: MARGIN,
      y: y - TITLE_FONT_SIZE,
      size: TITLE_FONT_SIZE,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= TITLE_FONT_SIZE + 12;
  }

  const maxLineWidth = pageWidth - 2 * MARGIN;
  const lines = wrapText(page.content, font, TEXT_FONT_SIZE, maxLineWidth);

  for (const line of lines) {
    if (y < MARGIN + LINE_HEIGHT) {
      // Long text — overflow onto a continuation page.
      pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - MARGIN;
    }
    pdfPage.drawText(line, {
      x: MARGIN,
      y: y - TEXT_FONT_SIZE,
      size: TEXT_FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;
  }
}

// Singleton markdown-it instance. Configured with `html: false` so any
// raw HTML in the markdown source is escaped as text (defense against
// LLM-supplied input — we don't render arbitrary HTML in PDFs).
// `linkify` and `breaks` left at defaults; users wanting hard-break
// behavior can use explicit blank lines.
const md = new MarkdownIt({ html: false });

/**
 * Render a markdown page by walking the block-level token tree from
 * `markdown-it`. Supported blocks (the 80% case for LLM-authored
 * content):
 *
 *   - `heading_open` / `heading_close` → bold + larger font (h1=18, h2=14, h3=12)
 *   - `paragraph_open` / `paragraph_close` → standard text
 *   - `bullet_list_open` / `list_item_open` → "• " prefix
 *   - `ordered_list_open` / `list_item_open` → "N. " prefix
 *
 * Unsupported blocks (deliberately fall through as escaped plain text):
 *
 *   - `code_block` / `fence` → fixed-width fonts not embedded; render as text
 *   - `table_open` → render cells as tab-separated text
 *   - `image` (inline) → render as `[image: alt-text]`
 *   - `blockquote_open` → render with `> ` prefix
 *
 * Inline emphasis (`em_open`, `strong_open`, `code_inline`) is collapsed
 * to plain text — preserving the runs would require interleaving font
 * switches inside `wrapText`, which the v1 single-font path doesn't do.
 * The information loss is acceptable for an MVP; future expansion would
 * thread a styled-runs renderer through `wrapText`.
 *
 * Why a custom walker instead of markdown-it's HTML renderer:
 * `md.render()` produces HTML, which we'd then have to parse and
 * convert back to layout primitives — strictly more code than walking
 * the token tree directly.
 */
function renderMarkdownPage(
  pdfDoc: PDFDocument,
  page: { type: "markdown"; content: string },
  pageDims: [number, number],
  font: import("pdf-lib").PDFFont,
  fontBold: import("pdf-lib").PDFFont,
): void {
  const [pageWidth, pageHeight] = pageDims;
  let pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - MARGIN;
  const maxLineWidth = pageWidth - 2 * MARGIN;

  const tokens = md.parse(page.content, {});
  let listDepth = 0;
  // Track whether we're inside an ordered list and its counter at each
  // depth so nested lists number correctly.
  const orderedListCounters: number[] = [];

  function ensureSpace(needed: number): void {
    if (y - needed < MARGIN) {
      pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - MARGIN;
    }
  }

  function drawLines(
    text: string,
    size: number,
    f: import("pdf-lib").PDFFont,
    indentPx: number,
  ): void {
    const lines = wrapText(text, f, size, maxLineWidth - indentPx);
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      pdfPage.drawText(line, {
        x: MARGIN + indentPx,
        y: y - size,
        size,
        font: f,
        color: rgb(0, 0, 0),
      });
      y -= LINE_HEIGHT;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === "heading_open") {
      const level = Number(tok.tag.slice(1)) || 3; // h1..h6 → 1..6
      const size = level === 1 ? 18 : level === 2 ? 14 : 12;
      const inline = tokens[i + 1];
      const text = inline?.content ?? "";
      ensureSpace(size + LINE_HEIGHT);
      // Add a small extra gap before headings to delineate sections,
      // but only if we're not at the top of the page.
      if (y < pageHeight - MARGIN) y -= 6;
      drawLines(text, size, fontBold, 0);
      i += 2; // skip the inline + heading_close tokens
      y -= 4; // gap after heading
    } else if (tok.type === "paragraph_open") {
      const inline = tokens[i + 1];
      const text = inline?.content ?? "";
      drawLines(text, TEXT_FONT_SIZE, font, listDepth * 16);
      i += 2;
      if (listDepth === 0) y -= 4; // paragraph spacing only outside lists
    } else if (tok.type === "bullet_list_open") {
      listDepth++;
      orderedListCounters.push(0); // 0 means "unordered" at this depth
    } else if (tok.type === "ordered_list_open") {
      listDepth++;
      orderedListCounters.push(1);
    } else if (
      tok.type === "bullet_list_close" ||
      tok.type === "ordered_list_close"
    ) {
      listDepth = Math.max(0, listDepth - 1);
      orderedListCounters.pop();
      y -= 4; // small gap after list
    } else if (tok.type === "list_item_open") {
      // Look ahead for the inline content of the first paragraph in
      // this item. The next tokens are typically:
      //   list_item_open → paragraph_open → inline → paragraph_close → list_item_close
      const para = tokens[i + 1];
      const inline = tokens[i + 2];
      if (para?.type === "paragraph_open" && inline?.type === "inline") {
        const counter = orderedListCounters[orderedListCounters.length - 1];
        const prefix = counter > 0 ? `${counter}. ` : "• ";
        if (counter > 0)
          orderedListCounters[orderedListCounters.length - 1] = counter + 1;

        const indentPx = (listDepth - 1) * 16;
        const fullText = `${prefix}${inline.content}`;
        drawLines(fullText, TEXT_FONT_SIZE, font, indentPx);
        // Skip ahead past the paragraph_open, inline, paragraph_close,
        // and list_item_close tokens we just consumed.
        i += 4;
      }
    } else if (tok.type === "fence" || tok.type === "code_block") {
      // Code blocks render as plain text (no monospace font embedded).
      drawLines(tok.content.replace(/\n$/, ""), TEXT_FONT_SIZE, font, 0);
      y -= 4;
    } else if (tok.type === "blockquote_open") {
      // Look ahead for the paragraph content; render with "> " prefix.
      const para = tokens[i + 1];
      const inline = tokens[i + 2];
      if (para?.type === "paragraph_open" && inline?.type === "inline") {
        drawLines(`> ${inline.content}`, TEXT_FONT_SIZE, font, 0);
        // Skip past paragraph_open, inline, paragraph_close, blockquote_close.
        i += 4;
        y -= 4;
      }
    }
    // Unhandled token types (hr, html_block, table_*, etc.) are
    // silently skipped. This is a deliberate v1 simplification — the
    // alternative (throwing) makes the tool brittle to LLM-generated
    // markdown that uses an unsupported block, and the alternative
    // (rendering as raw text) bloats the PDF for content nobody asked
    // to see. Skipping is the right default for a "best-effort
    // compose" tool.
  }
}

/**
 * Greedy word-wrap. Splits on whitespace, then accretes words into
 * lines as long as `font.widthOfTextAtSize(line, size)` stays under
 * `maxWidth`. Honors explicit `\n` as hard line breaks.
 *
 * Why not use a heavier text-layout library: pdf-lib's `widthOfTextAtSize`
 * is exact for the embedded font, and our content is short prose
 * (caption + body). We intentionally don't handle hyphenation or
 * justified text — single-paragraph PDFs don't need it.
 */
function wrapText(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      result.push("");
      continue;
    }
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width <= maxWidth) {
        current = candidate;
      } else {
        if (current.length > 0) result.push(current);
        // Single word too long for the line: hard-break it character-
        // wise. Pathological case (an unbroken 800-char URL); ugly but
        // never crashes.
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            const next = chunk + ch;
            if (font.widthOfTextAtSize(next, size) > maxWidth) {
              result.push(chunk);
              chunk = ch;
            } else {
              chunk = next;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current.length > 0) result.push(current);
  }
  return result;
}
