import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { FREE_DAILY_IMAGE_LIMIT } from "@/lib/ai/image-models";
import { isUpscaleConfigured, upscaleImageBytes } from "@/lib/ai/image-upscale";
import { getBlob } from "@/lib/blob";
import {
  countUserImagesToday,
  getDocumentById,
  saveDocument,
} from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const UPSCALE_MODEL_LABEL = "fal-ai/clarity-upscaler";

type UpscaleImageProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  // Credit/Pro → uncapped. Free → upscales count toward the 10/day (they cost).
  canUsePremium: boolean;
  // The image the user UPLOADED this turn (blob pathname), if any.
  uploadedImagePathname?: string;
  // The conversation's most recent image — used when the model omits `id` and
  // there's no fresh upload, so "upscale it" just works (same as edit_image).
  fallbackImageId?: string;
};

/**
 * Upscale / enhance an existing image's resolution (super-resolution, fal.ai
 * clarity-upscaler) — SPEC_AUDRIC_IMAGE_PIPELINE §12. Image→image, so it does NOT
 * go through the Gateway text→image path. Resolves the target the same way as
 * edit_image (explicit id → fresh upload → last image), saves the result as a new
 * image Document, and renders inline. Phase 4 — SFW; the source is an already-
 * rendered image so no new classifier is needed (the §5 floor still applies).
 */
export const upscaleImage = ({
  session,
  dataStream,
  canUsePremium,
  uploadedImagePathname,
  fallbackImageId,
}: UpscaleImageProps) =>
  tool({
    description:
      "Upscale / enhance the RESOLUTION of an image (super-resolution — sharper, higher-res, '4k it'). Use for 'upscale this', 'make it sharper / higher resolution / higher quality'. You normally DON'T need an id: it automatically targets the image currently being worked on (the one just made/edited, or the photo just uploaded). Pass `id` only to target a SPECIFIC older image. This does NOT change the content — for content changes use edit_image.",
    inputSchema: z.object({
      id: z
        .string()
        .optional()
        .describe(
          "OPTIONAL — only to target a specific OLDER image. Omit it for the current / just-made / just-uploaded image."
        ),
      scale: z
        .number()
        .optional()
        .describe("Upscale factor: 2 (default) or 4 (max)."),
    }),
    execute: async ({ id, scale }) => {
      if (!isUpscaleConfigured()) {
        return {
          error:
            "Image upscaling isn't available right now. I can still generate or edit images.",
        };
      }

      // Free tier: upscales count toward the 10/day image cap (they cost).
      if (!canUsePremium) {
        const usedToday = await countUserImagesToday(session.user.id);
        if (usedToday >= FREE_DAILY_IMAGE_LIMIT) {
          return {
            limitReached: true as const,
            message: `You've used all ${FREE_DAILY_IMAGE_LIMIT} free images for today (generations, edits + upscales). Add credits or upgrade to Pro for more — resets at midnight UTC.`,
          };
        }
      }

      const factor = scale === 4 ? 4 : 2;

      // Resolve the source: explicit id → fresh upload this turn → the last image
      // in the conversation (the model omitting an id is the common case).
      const docId = id ?? (uploadedImagePathname ? undefined : fallbackImageId);

      let sourceBase64: string | null = null;
      let sourceMediaType = "image/png";

      if (docId) {
        const document = await getDocumentById({ id: docId });
        if (!document) {
          return { error: "I couldn't find that image to upscale." };
        }
        if (document.userId !== session.user?.id) {
          return { error: "Forbidden" };
        }
        if (document.kind !== "image") {
          return { error: "That item isn't an image." };
        }
        sourceBase64 = document.content ?? null;
      } else if (uploadedImagePathname) {
        const blob = await getBlob(uploadedImagePathname);
        if (!blob) {
          return { error: "I couldn't read the uploaded image." };
        }
        sourceBase64 = blob.body.toString("base64");
        sourceMediaType = blob.contentType?.startsWith("image/")
          ? blob.contentType
          : "image/png";
      }

      if (!sourceBase64) {
        return {
          error:
            "There's no image to upscale yet — generate one first, or upload a photo.",
        };
      }

      dataStream.write({ type: "data-clear", data: null, transient: true });
      dataStream.write({ type: "data-kind", data: "image", transient: true });

      const upscaled = await upscaleImageBytes(
        sourceBase64,
        factor,
        sourceMediaType
      );
      if (!upscaled) {
        return {
          error:
            "The upscale didn't go through — your original image is unchanged. Try again in a moment.",
        };
      }

      const newId = generateUUID();
      await saveDocument({
        id: newId,
        title: `Upscaled ${factor}×`,
        content: upscaled,
        kind: "image",
        userId: session.user.id,
        model: UPSCALE_MODEL_LABEL,
      });

      dataStream.write({
        type: "data-imageDelta",
        data: upscaled,
        transient: true,
      });
      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id: newId,
        prompt: `Upscaled ${factor}×`,
        model: UPSCALE_MODEL_LABEL,
        versionIndex: 0,
        content:
          "The upscaled image is now shown. Reply with a 1-sentence confirmation.",
      };
    },
  });
