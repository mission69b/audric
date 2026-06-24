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
  // The most recent image in this conversation — used when the model omits `id`
  // and there's no fresh upload, so follow-up edits "just work" without the
  // model tracking ids (no "no image to edit" errors).
  fallbackImageId?: string;
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
  fallbackImageId,
}: EditImageProps) =>
  tool({
    description:
      "Edit/refine an image (image-to-image, preserves the subject) — e.g. 'add a glow', 'make it warmer', 'remove the background', 'make him younger', 'add tattoos', 'turn this into a watercolour'. You normally DON'T need an id: it automatically targets the image currently being worked on (the one you just made, or the photo the user just uploaded). Pass `id` only to target a SPECIFIC older image. Use generate_image for a brand-new image from scratch.",
    inputSchema: z.object({
      id: z
        .string()
        .optional()
        .describe(
          "OPTIONAL — only to target a specific OLDER image. Omit it for the current / just-made / just-uploaded image."
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

      // Resolve the target: explicit id → fresh upload this turn → the last
      // image in the conversation. The model omitting an id is the common case
      // and must "just work" (no "no image to edit" error / whack-a-mole).
      const docId = id ?? (uploadedImagePathname ? undefined : fallbackImageId);

      // Path B — edit the user's UPLOADED photo (fresh upload, no resolvable id).
      if (!docId) {
        if (!uploadedImagePathname) {
          return {
            error:
              "There's no image to edit yet — generate one first, or upload a photo.",
          };
        }
        const blob = await getBlob(uploadedImagePathname);
        if (!blob) {
          return { error: "I couldn't read the uploaded image." };
        }
        dataStream.write({ type: "data-clear", data: null, transient: true });
        dataStream.write({ type: "data-kind", data: "image", transient: true });
        // Pass the upload's REAL content type. A phone photo is usually
        // image/jpeg; the old code labeled every upload image/png, so the edit
        // model failed to decode it and returned text-only → "edit didn't go
        // through". (Generated images are always PNG → Path A unaffected.)
        const editMediaType = blob.contentType?.startsWith("image/")
          ? blob.contentType
          : "image/png";
        const edited = await editImageBytes(
          blob.body.toString("base64"),
          instruction,
          editMediaType
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

      // Edit an existing image by resolved id (explicit, or the conversation's
      // last image).
      const document = await getDocumentById({ id: docId });
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
      const versions = await getDocumentsById({ id: docId });
      const versionIndex = Math.max(0, versions.length - 1);

      return {
        id: docId,
        prompt: document.title,
        model: document.model ?? undefined,
        versionIndex,
        content:
          "The image has been edited and the updated version is now shown. Reply with a 1-sentence confirmation.",
      };
    },
  });
