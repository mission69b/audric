import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import {
  FREE_DAILY_IMAGE_LIMIT,
  resolveAspectRatio,
  selectImageModel,
} from "@/lib/ai/image-models";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import { countUserImagesToday } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type GenerateImageProps = {
  // Nullable: anon users get a sign-in gate (no generation).
  session: Session | null;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  // Credit/Pro user → no daily cap. Free (signed-in, no credits) → 10/day.
  canUsePremium: boolean;
};

/**
 * First-class, always-on image generation (SPEC_AUDRIC_IMAGE_PIPELINE Phase 1).
 * Replaces the fragile createDocument(kind:'image') heuristic gate — the model
 * calls this whenever the user wants an image, including a raw verb-less prompt.
 * Reuses the existing image backend via the image document handler.
 */
export const generateImage = ({
  session,
  dataStream,
  canUsePremium,
}: GenerateImageProps) =>
  tool({
    description:
      "Generate an image from a text description. Use this WHENEVER the user wants an image / photo / illustration / logo / art — INCLUDING when they paste a raw descriptive image prompt with no command verb (e.g. 'Photorealistic wide-angle photograph of …'). Put the full visual description in `prompt`. If the request is too vague to picture (e.g. a bare 'make me something'), ask ONE short clarifying question instead of calling this. To tweak an image you already made, use edit_image (not this).",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe("The full image description / generation prompt."),
      aspectRatio: z
        .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
        .optional()
        .describe("Optional aspect ratio; defaults to square (1:1)."),
      model: z
        .string()
        .optional()
        .describe(
          "Optional model id override (e.g. 'recraft/recraft-v4'). Omit to auto-select by style."
        ),
    }),
    execute: async ({ prompt, aspectRatio, model }) => {
      if (!session?.user) {
        return {
          signInRequired: true as const,
          message:
            "Generating images needs a (free) Audric account — sign in and I'll create it right away.",
        };
      }

      // Free tier (signed-in, no credits): 10 images/day, derived from the
      // image Documents already written (no counter). Paid/credit users: no cap.
      if (!canUsePremium) {
        const usedToday = await countUserImagesToday(session.user.id);
        if (usedToday >= FREE_DAILY_IMAGE_LIMIT) {
          return {
            limitReached: true as const,
            message: `You've used all ${FREE_DAILY_IMAGE_LIMIT} free images for today. Add credits or upgrade to Pro for more — your free allowance resets at midnight UTC.`,
          };
        }
      }

      const selected = selectImageModel({ prompt, hint: model });
      const ratio = resolveAspectRatio(selected, aspectRatio);
      const id = generateUUID();

      // Drive the inline render (same streaming protocol as createDocument).
      dataStream.write({ type: "data-kind", data: "image", transient: true });
      dataStream.write({ type: "data-id", data: id, transient: true });
      dataStream.write({ type: "data-title", data: prompt, transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      const handler = documentHandlersByArtifactKind.find(
        (h) => h.kind === "image"
      );
      if (!handler) {
        throw new Error("No image document handler registered");
      }

      try {
        await handler.onCreateDocument({
          id,
          title: prompt,
          dataStream,
          session,
          modelId: selected.id,
          imageModel: selected.id,
          aspectRatio: ratio,
        });
      } catch (_e) {
        return {
          // A directive to the AGENT (not user-facing copy): retry once silently
          // so a transient first-attempt failure doesn't surface as an apology
          // the user sees right before the image actually appears.
          error:
            "Image generation failed on this attempt. Retry ONCE NOW by calling generate_image again with a more detailed, descriptive prompt — do NOT apologize or ask the user first. Only if a SECOND attempt also fails, tell the user briefly and suggest rephrasing.",
        };
      }

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        prompt,
        model: selected.label,
        content:
          "The image is generated and now visible to the user. Reply with a 1-sentence confirmation. Do NOT call generate_image again for it — use edit_image if the user wants a change.",
      };
    },
  });
