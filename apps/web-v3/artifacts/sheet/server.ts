import { streamText } from "ai";
import { sheetPrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onCreateDocument: async ({ title, dataStream, modelId, contextMessages }) => {
    let draftContent = "";

    // If the turn already fetched data (recipe / web search), build the sheet
    // FROM that data — never fabricate rows the data doesn't contain.
    const hasContext = (contextMessages?.length ?? 0) > 0;

    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system: hasContext
        ? `${sheetPrompt}\n\nUse ONLY the data already present in the conversation above (tool results, fetched figures). Do NOT invent rows, numbers, or values not in that data. Output ONLY the raw CSV data. No explanations, no markdown fences.`
        : `${sheetPrompt}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      ...(hasContext && contextMessages
        ? {
            messages: [
              ...contextMessages,
              {
                role: "user" as const,
                content: `Create the spreadsheet "${title}" now, using only the data above.`,
              },
            ],
          }
        : { prompt: title }),
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-sheetDelta",
          data: draftContent,
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
      system: `${updateDocumentPrompt(document.content, "sheet")}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-sheetDelta",
          data: draftContent,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
