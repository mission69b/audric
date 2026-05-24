/**
 * # getMessageText — flatten UIMessage parts to a copyable string
 *
 * ## Why this exists (SPEC_AI_SDK_HARDENING / P5.2)
 *
 * The chat row Copy button needs a plain-text projection of the
 * assistant or user message. UIMessage's `parts[]` is a heterogeneous
 * array: `text`, `reasoning`, `tool-*`, `data-audric-bundle`, etc.
 * Only `text` parts make sense in clipboard output:
 *
 *   - **reasoning** is the model's private thinking. Copying it would
 *     surface internal chain-of-thought the user didn't ask for.
 *   - **tool-*** parts render as cards (PermissionCard, ToolReceipt,
 *     etc.). The card visual is the payload; the raw JSON would be
 *     confusing.
 *   - **data-audric-bundle** is a UI marker — copying it puts
 *     `[object Object]` in the clipboard.
 *
 * Behaviour: concatenates every `text` part with `\n\n` separators.
 * Returns empty string if the message has no text parts (e.g. a
 * pure-tool turn that hasn't narrated yet).
 */

import type { UIMessage } from "ai";

export function getMessageText(message: UIMessage): string {
  const textParts: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text);
    }
  }
  return textParts.join("\n\n");
}
