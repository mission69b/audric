/**
 * Chat title generation (LOCK-5, BENEFITS_SPEC_v07e_persistent_chats §4).
 *
 * Generates a 2-5 word sidebar title for a freshly-created chat by summarising
 * the first user message via the dedicated `titleModel` (Mistral Small via the
 * AI Gateway by default). Called fire-and-forget from `/api/chat` on first
 * turn so it never blocks the user-perceived stream start; the row is updated
 * asynchronously once the model returns (~300-600ms typically).
 *
 * **Cost basis:** Mistral Small ~$0.0001 per ~10-token summary, so 10k chats
 * ≈ $1/month at current pricing — well under any other turn-level write.
 *
 * **Failure mode:** A title-gen failure is non-fatal. The row keeps its NULL
 * title and the sidebar shows the first-50-chars fallback rendered by the
 * sidebar component. We log + swallow the error so it never propagates back
 * to the chat stream.
 *
 * Lineage: this helper replaces `generateTitleFromUserMessage()` from the
 * Vercel AI SDK chatbot template's `app/(chat)/actions.ts:23-40` (deleted in
 * Phase 2.2). Same model, same prompt, just integrated with prisma persistence
 * and the no-throw error contract.
 */

import { generateText } from "ai";
import { titleModel } from "@/lib/ai/models";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import { updateChatTitle } from "./chat-persistence";
import { redactAddressesInText } from "./log-redact";

const TITLE_MAX_CHARS = 80;

/**
 * Strip the LLM's wrapping noise. Title models occasionally return
 * `"# Save USDC into NAVI"` or `'"Swap SUI for USDC"'` despite the prompt
 * saying "no formatting" — the regexes handle both.
 */
function sanitiseTitle(raw: string): string {
  return raw
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim()
    .slice(0, TITLE_MAX_CHARS);
}

export async function generateChatTitle({
  chatId,
  firstUserMessageText,
}: {
  chatId: string;
  firstUserMessageText: string;
}): Promise<void> {
  if (firstUserMessageText.trim().length === 0) {
    // Nothing to summarise — leave title null; sidebar renders a fallback.
    return;
  }

  // [P1-I] Redact Sui addresses from the prompt before sending to the
  // third-party model. The title prompt only needs the user's INTENT
  // (verb + asset + rough amount), not the full address — addresses
  // are profile-revealing PII when joined with on-chain history. We
  // preserve everything else (amounts, asset tickers, verbs) since
  // titles like "Save 5 USDC" are useful and amounts alone aren't
  // identifying.
  const redactedPrompt = redactAddressesInText(firstUserMessageText);

  try {
    const { text } = await generateText({
      model: getTitleModel(),
      system: titlePrompt,
      prompt: redactedPrompt,
      providerOptions: {
        gateway: { order: titleModel.gatewayOrder },
      },
    });
    const title = sanitiseTitle(text);
    if (title.length === 0) {
      return;
    }
    await updateChatTitle({ chatId, title });
  } catch (err) {
    console.warn(
      `[chat-title] generation failed for chatId=${chatId} (non-fatal):`,
      err instanceof Error ? err.message : String(err)
    );
  }
}
