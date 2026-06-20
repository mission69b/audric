import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import { getDocumentById, getDocumentsById } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";

type UpdateDocumentProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
};

export const updateDocument = ({
  session,
  dataStream,
  modelId,
}: UpdateDocumentProps) =>
  tool({
    description:
      "Full rewrite of an existing artifact. Only use for major changes where most content needs replacing. Prefer editDocument for targeted changes.",
    inputSchema: z.object({
      id: z.string().describe("The ID of the artifact to rewrite"),
      description: z
        .string()
        .default("Improve the content")
        .describe("The description of changes that need to be made"),
    }),
    execute: async ({ id, description }) => {
      const document = await getDocumentById({ id });

      if (!document) {
        return {
          error: "Document not found",
        };
      }

      if (document.userId !== session.user?.id) {
        return { error: "Forbidden" };
      }

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      // Broadcast the kind so the active artifact reflects THIS document during
      // the update (the inline-vs-card render decision falls back to it while the
      // tool output isn't available yet).
      dataStream.write({
        type: "data-kind",
        data: document.kind,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === document.kind
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${document.kind}`);
      }

      try {
        await documentHandler.onUpdateDocument({
          document,
          description,
          dataStream,
          session,
          modelId,
        });
      } catch (_e) {
        // Honest failure (e.g. the image edit model returned no image) — the
        // original document is untouched (no new version saved). Tell the model
        // so it asks the user to retry, instead of showing a broken card.
        return {
          error:
            document.kind === "image"
              ? "The image edit didn't go through this time — your original image is unchanged. Ask the user to try again or rephrase the change."
              : "The update didn't go through — please try again.",
        };
      }

      dataStream.write({ type: "data-finish", data: null, transient: true });

      // The edit is saved as a NEW version under the same id. Pin THIS message to
      // its own version so the inline render shows the edited result while the
      // ORIGINAL createDocument message keeps showing version 0 (immutable
      // history — otherwise every message sharing the id flips to the latest).
      const versions = await getDocumentsById({ id });
      const versionIndex = Math.max(0, versions.length - 1);

      return {
        id,
        title: document.title,
        kind: document.kind,
        versionIndex,
        content:
          document.kind === "code"
            ? "The script has been updated successfully."
            : "The document has been updated successfully.",
      };
    },
  });
