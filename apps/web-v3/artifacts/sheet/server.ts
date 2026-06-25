import { streamText } from "ai";
import { sheetPrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { flattenContext } from "../text/server";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onCreateDocument: async ({ title, dataStream, modelId, contextMessages }) => {
    let draftContent = "";

    // If the turn already fetched data (web search / data skill), build the sheet
    // FROM that data — never fabricate rows. Flatten to plain text (not the raw
    // tool-call messages, which strict providers reject → empty output).
    const contextText = contextMessages?.length
      ? flattenContext(contextMessages)
      : "";
    const useContext = contextText.trim().length > 0;

    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      instructions: useContext
        ? `${sheetPrompt}\n\nUse ONLY the data provided below (tool results, fetched figures). Do NOT invent rows, numbers, or values not in that data. Output ONLY the raw CSV data. No explanations, no markdown fences.`
        : `${sheetPrompt}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      prompt: useContext
        ? `Data available from this turn:\n\n${contextText}\n\nCreate the spreadsheet "${title}" now, using ONLY the data above.`
        : title,
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
      instructions: `${updateDocumentPrompt(document.content, "sheet")}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
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
