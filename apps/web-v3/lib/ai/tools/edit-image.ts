import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { editImageBytes, IMAGE_EDIT_MODEL } from "@/artifacts/image/server";
import { FREE_DAILY_IMAGE_LIMIT } from "@/lib/ai/image-models";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import { getBlob } from "@/lib/blob";
import {
  countUserImagesToday,
  getDocumentById,
  getDocumentsById,
  saveDocument,
} from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type EditImageProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  // Credit/Pro user → no daily cap. Free → edits count toward the 10/day.
  canUsePremium: boolean;
  // The latest image the user UPLOADED this turn (blob pathname), if any —
  // lets edit_image transform an uploaded photo (Path B, consensual likeness).
  uploadedImagePathname?: string;
};

/**
 * Edit/refine an existing generated image (image-to-image, preserves subject).
 * Thin wrapper over the existing image document handler's onUpdateDocument
 * (Gemini Nano Banana). Phase 1 — SFW only.
 */
export const editImage = ({
  session,
  dataStream,
  canUsePremium,
  uploadedImagePathname,
}: EditImageProps) =>
  tool({
    description:
      "Edit/refine an image (image-to-image, preserves the subject). TWO modes: (1) edit a previously GENERATED image — pass its `id` (from the generate_image result); (2) edit the user's UPLOADED photo — OMIT `id` (it uses the photo they just uploaded). Examples: 'add a glow', 'make it warmer', 'remove the background', 'turn this into a watercolour', 'make a clean headshot from my photo'. Use generate_image for a brand-new image from scratch.",
    inputSchema: z.object({
      id: z
        .string()
        .optional()
        .describe(
          "The id of a previously GENERATED image to edit. OMIT this to edit the user's UPLOADED photo."
        ),
      instruction: z
        .string()
        .describe(
          "Short description of the change ONLY (not a full re-prompt)."
        ),
    }),
    execute: async ({ id, instruction }) => {
      // Free tier: edits count toward the 10/day image cap (they cost too).
      if (!canUsePremium) {
        const usedToday = await countUserImagesToday(session.user.id);
        if (usedToday >= FREE_DAILY_IMAGE_LIMIT) {
          return {
            limitReached: true as const,
            message: `You've used all ${FREE_DAILY_IMAGE_LIMIT} free images for today (generations + edits). Add credits or upgrade to Pro for more — resets at midnight UTC.`,
          };
        }
      }

      // Path B — edit the user's UPLOADED photo (no generated id given).
      if (!id) {
        if (!uploadedImagePathname) {
          return {
            error:
              "There's no image to edit — ask the user to upload a photo, or generate one first.",
          };
        }
        const blob = await getBlob(uploadedImagePathname);
        if (!blob) {
          return { error: "I couldn't read the uploaded image." };
        }
        dataStream.write({ type: "data-clear", data: null, transient: true });
        dataStream.write({ type: "data-kind", data: "image", transient: true });
        const edited = await editImageBytes(
          blob.body.toString("base64"),
          instruction
        );
        if (!edited) {
          return {
            error:
              "The edit didn't go through this time — ask the user to try again or rephrase the change.",
          };
        }
        const newId = generateUUID();
        await saveDocument({
          id: newId,
          title: instruction,
          content: edited,
          kind: "image",
          userId: session.user.id,
          model: IMAGE_EDIT_MODEL,
        });
        dataStream.write({
          type: "data-imageDelta",
          data: edited,
          transient: true,
        });
        dataStream.write({ type: "data-finish", data: null, transient: true });
        return {
          id: newId,
          prompt: instruction,
          model: IMAGE_EDIT_MODEL,
          versionIndex: 0,
          content:
            "The edited image is now shown. Reply with a 1-sentence confirmation.",
        };
      }

      // Edit a previously GENERATED image (by id).
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
