import { smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelId, contextMessages }) => {
    let draftContent = "";

    // When the turn already fetched data (a recipe, a web search), write the
    // document FROM that data — never invent facts the data doesn't contain.
    // Otherwise fall back to writing about the title topic from knowledge.
    const hasContext = (contextMessages?.length ?? 0) > 0;

    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system: hasContext
        ? "Write the requested document using ONLY the data already present in the conversation above (tool results, fetched figures, headlines, prior messages). Do NOT invent or estimate facts, numbers, prices, dates, or headlines that are not in that data — if something isn't available, omit it or note it's unavailable. Markdown supported; use headings."
        : "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      ...(hasContext && contextMessages
        ? {
            messages: [
              ...contextMessages,
              {
                role: "user" as const,
                content: `Write the document titled "${title}" now, using only the data above.`,
              },
            ],
          }
        : { prompt: title }),
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
