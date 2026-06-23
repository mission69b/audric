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
            return part;
          }

          // PDF → extract text, inject as a text part.
          if (filePart.mediaType === PDF_MEDIA_TYPE) {
            try {
              const blob = await getBlob(pathname);
              if (!blob) {
                return part;
              }
              const name = filePart.filename ?? filePart.name ?? "document.pdf";
              const text = await extractPdfText(
                pathname,
                new Uint8Array(blob.body)
              );
              const body = text.trim()
                ? `The user attached a PDF ("${name}"). Extracted text follows — use it to answer their question.\n\n<pdf name="${name}">\n${text}\n</pdf>`
                : `The user attached a PDF ("${name}"), but no text could be extracted — it is likely a scanned/image-only PDF. Tell them you couldn't read it and suggest a text-based PDF or pasting the relevant text.`;
              return { type: "text" as const, text: body };
            } catch {
              return part;
            }
          }

          // Image → inline as base64.
          if (filePart.mediaType?.startsWith("image/")) {
            try {
              const blob = await getBlob(pathname);
              if (!blob) {
                return part;
              }
              const base64 = blob.body.toString("base64");
              return {
                ...part,
                url: `data:${blob.contentType};base64,${base64}`,
              };
            } catch {
              return part;
            }
          }

          return part;
        })
      );
      return { ...message, parts: parts as ChatMessage["parts"] };
    })
  );
}
