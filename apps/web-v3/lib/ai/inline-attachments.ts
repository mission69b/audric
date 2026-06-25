import "server-only";

import { getBlob } from "@/lib/blob";
import type { ChatMessage } from "@/lib/types";

const BLOB_PREFIX = "/api/files/blob";
const PDF_MEDIA_TYPE = "application/pdf";
// Cap injected PDF text (~25k tokens) so a big doc can't blow the context
// budget / cost. Truncation is flagged to the model.
const PDF_TEXT_MAX_CHARS = 100_000;

/** Recover the blob pathname from our in-app read URL (`/api/files/blob?pathname=`). */
function pathnameFromUrl(url: string): string | null {
  if (!url.startsWith(BLOB_PREFIX)) {
    return null;
  }
  try {
    return new URL(url, "http://local").searchParams.get("pathname");
  } catch {
    return null;
  }
}

// PDF text doesn't change for a given blob, but inline-prep runs every turn —
// cache by pathname (bounded) so a re-sent PDF isn't re-parsed each message on
// a warm instance.
const PDF_CACHE_MAX = 30;
const pdfTextCache = new Map<string, string>();

async function extractPdfText(
  pathname: string,
  bytes: Uint8Array
): Promise<string> {
  const cached = pdfTextCache.get(pathname);
  if (cached !== undefined) {
    return cached;
  }
  let text = "";
  try {
    // Dynamic import — unpdf is heavy + only needed when a PDF is present.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const res = await extractText(pdf, { mergePages: true });
    text = (Array.isArray(res.text) ? res.text.join("\n") : res.text) ?? "";
  } catch {
    text = "";
  }
  if (text.length > PDF_TEXT_MAX_CHARS) {
    text = `${text.slice(0, PDF_TEXT_MAX_CHARS)}\n\n[…PDF truncated]`;
  }
  if (pdfTextCache.size >= PDF_CACHE_MAX) {
    const oldest = pdfTextCache.keys().next().value;
    if (oldest) {
      pdfTextCache.delete(oldest);
    }
  }
  pdfTextCache.set(pathname, text);
  return text;
}

type FilePart = {
  type: "file";
  url?: string;
  mediaType?: string;
  filename?: string;
  name?: string;
};

/**
 * Prepare private-blob attachments for the model call. Our blobs are private +
 * session-gated (`/api/files/blob?...`) — the model can't fetch that URL, so we
 * resolve the bytes server-side (we have the session):
 *  - IMAGES → inline as a base64 `data:` URL (vision models read it directly).
 *  - PDFs → extract text and replace the file part with a TEXT part, so EVERY
 *    model (incl. the free open ones that can't read PDFs) can use the document.
 * Storage-agnostic; external / already-inlined URLs pass through. Best-effort —
 * a read/parse failure leaves the part as-is rather than crashing the turn.
 */
export async function prepareAttachments(
  messages: ChatMessage[]
): Promise<ChatMessage[]> {
  return await Promise.all(
    messages.map(async (message) => {
      if (!Array.isArray(message.parts)) {
        return message;
      }
      const parts = await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") {
            return part;
          }
          const filePart = part as FilePart;
          if (typeof filePart.url !== "string") {
            return part;
          }
          const pathname = pathnameFromUrl(filePart.url);
          if (!pathname) {
            // External (non-blob) URL — leave it for the model to fetch.
            return part;
          }
          const name = filePart.filename ?? filePart.name ?? "file";

          // Image → inline as base64 (vision models can't fetch our private URL).
          if (filePart.mediaType?.startsWith("image/")) {
            try {
              const blob = await getBlob(pathname);
              if (blob) {
                const base64 = blob.body.toString("base64");
                return {
                  ...part,
                  url: `data:${blob.contentType};base64,${base64}`,
                };
              }
            } catch {
              // fall through to the note below — never leak a raw private URL
            }
            return {
              type: "text" as const,
              text: `[The user attached an image ("${name}") but it couldn't be loaded.]`,
            };
          }

          // PDF → extract text → text part. ALWAYS returns text (extracted, or a
          // note on failure) — a raw application/pdf file part to the gateway
          // 500s on the open models, so we NEVER let one through. Detect by
          // mediaType OR a .pdf url/name (defensive against odd content types).
          const isPdf =
            filePart.mediaType === PDF_MEDIA_TYPE ||
            /\.pdf(\?|$)/i.test(filePart.url) ||
            /\.pdf$/i.test(name);
          if (isPdf) {
            let text = "";
            try {
              const blob = await getBlob(pathname);
              if (blob) {
                text = await extractPdfText(
                  pathname,
                  new Uint8Array(blob.body)
                );
              }
            } catch {
              text = "";
            }
            const body = text.trim()
              ? `The user attached a PDF ("${name}"). Extracted text follows — use it to answer their question.\n\n<pdf name="${name}">\n${text}\n</pdf>`
              : `The user attached a PDF ("${name}"), but no text could be extracted — it is likely a scanned/image-only PDF. Tell them you couldn't read it and suggest a text-based PDF or pasting the relevant text.`;
            return { type: "text" as const, text: body };
          }

          // text/plain → a large clipboard paste turned into a "Pasted text"
          // attachment (Claude-style). Decode the blob and inline it as text so
          // the model reads it (same idea as PDF, but no parsing needed).
          const isText =
            filePart.mediaType === "text/plain" ||
            /\.txt(\?|$)/i.test(filePart.url) ||
            /\.txt$/i.test(name);
          if (isText) {
            let text = "";
            try {
              const blob = await getBlob(pathname);
              if (blob) {
                text = blob.body.toString("utf-8");
              }
            } catch {
              text = "";
            }
            if (text.length > PDF_TEXT_MAX_CHARS) {
              text = `${text.slice(0, PDF_TEXT_MAX_CHARS)}\n\n[…text truncated]`;
            }
            return {
              type: "text" as const,
              text: text.trim()
                ? `The user pasted a block of text (attached as "${name}"). It follows — use it to answer their question.\n\n<pasted_text>\n${text}\n</pasted_text>`
                : `[The user attached pasted text ("${name}") but it couldn't be read.]`,
            };
          }

          // Any other private-blob file type the model can't fetch → a text note
          // (never leak a non-fetchable file part — it errors the gateway).
          return {
            type: "text" as const,
            text: `[The user attached a file ("${name}", ${filePart.mediaType ?? "unknown type"}) that can't be read here.]`,
          };
        })
      );
      return { ...message, parts: parts as ChatMessage["parts"] };
    })
  );
}
