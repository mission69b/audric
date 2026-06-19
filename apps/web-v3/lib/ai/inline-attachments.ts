import "server-only";

import { getBlob } from "@/lib/blob";
import type { ChatMessage } from "@/lib/types";

const BLOB_PREFIX = "/api/files/blob";

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

/**
 * Inline private-blob IMAGE attachments as base64 data URLs before the model
 * call. Our blobs are private + session-gated (`/api/files/blob?...`) — a vision
 * model can't fetch that URL, so we fetch the bytes server-side (we have the
 * session) and hand the model an inline `data:` URL instead. Storage-agnostic:
 * only rewrites image file parts that point at our own blob store; external or
 * already-inlined URLs pass through untouched. Best-effort — a read failure
 * leaves the part as-is rather than crashing the turn.
 */
export async function inlineImageAttachments(
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
          const filePart = part as {
            type: "file";
            url?: string;
            mediaType?: string;
          };
          if (
            typeof filePart.url !== "string" ||
            !filePart.mediaType?.startsWith("image/")
          ) {
            return part;
          }
          const pathname = pathnameFromUrl(filePart.url);
          if (!pathname) {
            return part;
          }
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
        })
      );
      return { ...message, parts };
    })
  );
}
