/**
 * Scan a chat's persisted messages for image activity — powers edit_image's
 * cross-turn fallback resolution (the 2026-06-24 paid-customer fix).
 *
 * Returns:
 * - `lastImageId` — the most recent RESOLVABLE image document id in the chat
 *   (a generated/edited image, or an old createDocument-image, that persisted a
 *   tool-output id). `undefined` when the chat had image activity but no id
 *   could be pinned (a weak Auto model wrote a messy tool part, or the model
 *   switched between turns — the exact failure mode of the bug).
 * - `chatHasImageSignal` — did this chat EVER surface an image at all (a
 *   generated/edited one OR a photo the user uploaded)? The chat route uses this
 *   to GATE the DB-backed fallback, so a brand-new chat keeps the honest
 *   "upload or generate one first" prompt instead of grabbing another chat's
 *   image.
 *
 * Pure + deterministic → directly evalable (scripts/eval-image-fallback.mts),
 * no model / DB / network. Mirrors the part shapes the AI SDK persists.
 */

type ScanPart = {
  type?: string;
  mediaType?: string;
  output?: { id?: string; kind?: string };
  input?: { kind?: string };
};

type ScanMessage = { role?: string; parts?: unknown };

export type ChatImageScan = {
  lastImageId?: string;
  chatHasImageSignal: boolean;
};

export function scanChatImages(messages: ScanMessage[]): ChatImageScan {
  let lastImageId: string | undefined;
  let chatHasImageSignal = false;

  for (const m of messages) {
    if (!Array.isArray(m.parts)) {
      continue;
    }
    for (const p of m.parts as ScanPart[]) {
      // A user-uploaded image (the Path-B edit source) counts as image activity
      // even though it carries no document id.
      if (p.type === "file" && p.mediaType?.startsWith("image/")) {
        chatHasImageSignal = true;
      }
      if (m.role !== "assistant") {
        continue;
      }
      if (p.type === "tool-generate_image" || p.type === "tool-edit_image") {
        chatHasImageSignal = true;
        if (p.output?.id) {
          lastImageId = p.output.id;
        }
      } else if (
        p.type === "tool-createDocument" &&
        (p.output?.kind === "image" || p.input?.kind === "image")
      ) {
        chatHasImageSignal = true;
        if (p.output?.id) {
          lastImageId = p.output.id;
        }
      }
    }
  }

  return { lastImageId, chatHasImageSignal };
}
