import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type CreateDocumentProps = {
  // Nullable: anonymous (free-trial) users create artifacts that render live
  // from the stream but aren't persisted (no account to attach them to).
  session: Session | null;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
};

export const createDocument = ({
  session,
  dataStream,
  modelId,
}: CreateDocumentProps) =>
  tool({
    description:
      "Create a side-panel artifact for content that belongs in a panel: kind 'code' for any programming/algorithm/script, 'sheet' for spreadsheets/tabular data, 'image' to GENERATE an image from a description. " +
      "Do NOT use this for plain writing — essays, posts, tweets, summaries, explanations, answers, lists. Write all prose INLINE in your reply (there is no 'text' kind). " +
      "To CHANGE or refine an EXISTING generated image (e.g. 'make it more modern', 'add a glow', 'warmer colors'), call updateDocument with that image's id and a SHORT instruction describing only the change — it edits the actual image and preserves it. Use createDocument with kind:'image' only for a brand-new, unrelated image.",
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "The artifact title — for kind 'image' this is the image generation PROMPT (describe the image to create)."
        ),
      kind: z
        .enum(["code", "sheet", "image"])
        .describe(
          "REQUIRED. 'code' for programming/algorithms/scripts, 'sheet' for spreadsheets/tables/data, 'image' to generate an image. There is NO 'text' kind — write prose INLINE in your reply, never as an artifact."
        ),
    }),
    execute: async ({ title, kind }, { messages }) => {
      const id = generateUUID();

      dataStream.write({
        type: "data-kind",
        data: kind,
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: title,
        transient: true,
      });

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      await documentHandler.onCreateDocument({
        id,
        title,
        dataStream,
        session,
        modelId,
        // The live step messages carry prior tool results (recipe/search data),
        // so a 'code'/'sheet' handler can write from real data, not the title alone.
        contextMessages: messages,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      // The artifact is ALREADY fully written here (onCreateDocument streamed the
      // complete content from contextMessages). Tell the model so explicitly —
      // the old "A document was created" wording read as "empty, needs filling",
      // so some models (e.g. grok) chained an updateDocument call → a SECOND
      // identical artifact. Be unambiguous: it's done; do not update it.
      const noun =
        kind === "code" ? "script" : kind === "image" ? "image" : "spreadsheet";
      return {
        id,
        title,
        kind,
        content:
          `The ${noun} is complete and fully written from the provided data — it is now visible to the user. ` +
          "Do NOT call updateDocument, editDocument, or createDocument again for it unless the user explicitly asks for a change. " +
          "Reply with only a 1-2 sentence confirmation.",
      };
    },
  });
