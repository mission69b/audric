import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import { getDocumentById, getDocumentsById } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";

type EditImageProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * Edit/refine an existing generated image (image-to-image, preserves subject).
 * Thin wrapper over the existing image document handler's onUpdateDocument
 * (Gemini Nano Banana). Phase 1 — SFW only.
 */
export const editImage = ({ session, dataStream }: EditImageProps) =>
  tool({
    description:
      "Edit/refine an EXISTING generated image — e.g. 'add a glow', 'make it warmer', 'remove the background', 'give them a hat'. Pass the image's id (from the prior generate_image result) + a SHORT instruction describing ONLY the change. It edits the actual image and preserves it. Use generate_image for a brand-new, unrelated image.",
    inputSchema: z.object({
      id: z
        .string()
        .describe("The id of the image to edit (from the generate_image result)."),
      instruction: z
        .string()
        .describe("Short description of the change ONLY (not a full re-prompt)."),
    }),
    execute: async ({ id, instruction }) => {
      const document = await getDocumentById({ id });
      if (!document) {
        return { error: "I couldn't find that image to edit." };
      }
      if (document.userId !== session.user?.id) {
        return { error: "Forbidden" };
      }
      if (document.kind !== "image") {
        return { error: "That item isn't an image." };
      }

      dataStream.write({ type: "data-clear", data: null, transient: true });
      dataStream.write({ type: "data-kind", data: "image", transient: true });

      const handler = documentHandlersByArtifactKind.find(
        (h) => h.kind === "image"
      );
      if (!handler) {
        throw new Error("No image document handler registered");
      }

      try {
        await handler.onUpdateDocument({
          document,
          description: instruction,
          dataStream,
          session,
          modelId: "image-edit",
        });
      } catch (_e) {
        return {
          error:
            "The edit didn't go through — your original image is unchanged. Ask the user to try again or rephrase the change.",
        };
      }

      dataStream.write({ type: "data-finish", data: null, transient: true });

      // The edit saves a NEW version under the same id — pin THIS message to it
      // so history stays immutable (older messages keep their version).
      const versions = await getDocumentsById({ id });
      const versionIndex = Math.max(0, versions.length - 1);

      return {
        id,
        prompt: document.title,
        model: document.model ?? undefined,
        versionIndex,
        content:
          "The image has been edited and the updated version is now shown. Reply with a 1-sentence confirmation.",
      };
    },
  });
