import type { UIMessage } from "ai";

// The mobile app's chat message — a Vercel AI SDK `UIMessage` (role + `parts[]`),
// the SAME wire model web-v3 uses (`lib/types.ts` `ChatMessage`). Text turns stream
// real `text` parts from the provider; the prototype's demo surfaces (wallet card /
// image / video / artifact) ride along as typed `metadata` on an assistant message
// so the whole conversation stays ONE parts-based list — no parallel mock store.
//
// In web-v3 those surfaces are real tool-call parts; here they are still mock, but
// modelled as metadata so the render path already reads `parts` + `metadata` the
// way the production client does.
export type MessageMetadata = {
  /** A prototype demo turn (mock, not model output) and its render kind. */
  demo?: "wallet" | "image" | "video" | "artifact";
  /** Artifact card labels (demo). */
  artTitle?: string;
  artKind?: string;
};

export type ChatMessage = UIMessage<MessageMetadata>;

// Pulls the plain text out of a message's parts (concatenating every text part) —
// the assistant bubble / user bubble body. Non-text parts (future tools) are
// ignored here.
export function messageText(message: ChatMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}
