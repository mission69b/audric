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
  /** A prototype demo turn (mock, not model output) and its render kind. The
   * render path badges these as "Demo" so a canned card can never be mistaken
   * for model output. There is deliberately no `wallet` kind: a fabricated
   * balance is a financial claim, so wallet questions go to the real model and
   * its `balance_check` tool instead. */
  demo?: "image" | "video" | "artifact";
  /** Artifact card labels (demo). */
  artTitle?: string;
  artKind?: string;
  /** Turn start (epoch ms), stamped by the server on the `start` stream part —
   * drives the Chain-of-Thought elapsed timer ("Thought for Xs"). Same role as
   * web-v3's `metadata.createdAt`. Absent on history-reloaded messages. */
  createdAt?: number;
  /** Model id that produced the turn (server-stamped). */
  modelId?: string;
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
