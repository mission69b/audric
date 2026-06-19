import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from "@/lib/artifacts/server";
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
      "Create an artifact. You MUST specify kind: 'code' for any programming/algorithm request (creates a script), 'text' for essays/writing (creates a document), 'sheet' for spreadsheets/data, 'image' to GENERATE an image from a description (the user asks to draw/generate/create a picture, logo, art, photo, etc.).",
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "The artifact title — for kind 'image' this is the image generation PROMPT (describe the image to create)."
        ),
      kind: z
        .enum(artifactKinds)
        .describe(
          "REQUIRED. 'code' for programming/algorithms, 'text' for essays/writing, 'sheet' for spreadsheets, 'image' for image generation"
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
        // so kinds like 'text' write from real data instead of the title alone.
        contextMessages: messages,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title,
        kind,
        content:
          kind === "code"
            ? "A script was created and is now visible to the user."
            : "A document was created and is now visible to the user.",
      };
    },
  });
