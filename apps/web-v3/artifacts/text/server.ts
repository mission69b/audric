import { type ModelMessage, smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

/**
 * Flatten the turn's messages (tool results, prior text) into PLAIN TEXT. We
 * deliberately do NOT re-feed the raw messages array: it carries tool-call /
 * tool-result parts from the in-flight turn, and strict providers (Anthropic)
 * reject the unbalanced structure and return empty — which produced empty docs
 * on Claude while lenient models (Kimi) tolerated it. A plain prompt is
 * model-agnostic.
 */
export function flattenContext(messages: ModelMessage[]): string {
  const chunks: string[] = [];
  for (const m of messages) {
    const content = m.content;
    if (typeof content === "string") {
      if (content.trim()) {
        chunks.push(content);
      }
      continue;
    }
    for (const part of content) {
      if (part.type === "text" && part.text.trim()) {
        chunks.push(part.text);
      } else if (part.type === "tool-result") {
        const out = (part as { output?: unknown }).output;
        if (out != null) {
          chunks.push(typeof out === "string" ? out : JSON.stringify(out));
        }
      }
    }
  }
  // Cap so a large recipe/news payload can't blow the artifact-gen context.
  return chunks.join("\n\n").slice(0, 24_000);
}

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelId, contextMessages }) => {
    let draftContent = "";

    // When the turn already fetched data (a recipe, a web search), write the
    // document FROM that data — never invent facts the data doesn't contain.
    // Otherwise fall back to writing about the title topic from knowledge.
    const contextText = contextMessages?.length
      ? flattenContext(contextMessages)
      : "";
    const useContext = contextText.trim().length > 0;

    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system: useContext
        ? "Write the requested document using ONLY the data provided below (tool results, fetched figures, headlines). Do NOT invent or estimate facts, numbers, prices, dates, or headlines that aren't in that data — if something isn't available, omit it. Markdown supported; use headings."
        : "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: useContext
        ? `Data available from this turn:\n\n${contextText}\n\nWrite the document titled "${title}" now, using ONLY the data above.`
        : title,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";

    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system: updateDocumentPrompt(document.content, "text"),
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
