import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { editImageBytes, IMAGE_EDIT_MODEL } from "@/artifacts/image/server";
import { FREE_DAILY_IMAGE_LIMIT } from "@/lib/ai/image-models";
import { classifyReferenceRequest } from "@/lib/ai/image-safety";
import {
  fetchImageAsBase64,
  findReferenceImageUrl,
} from "@/lib/ai/reference-search";
import { countUserImagesToday, saveDocument } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type GenerateFromReferenceProps = {
  session: Session | null;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  canUsePremium: boolean;
};

/**
 * Reference-grounded generation (SPEC_AUDRIC_IMAGE_PIPELINE Path C). For a
 * SPECIFIC real subject the model can't render accurately from text: look up a
 * real reference photo (Perplexity), then img2img from it. One server-
 * orchestrated tool (classify → search → fetch → generate) so there's no fragile
 * agent multi-tool chaining. Safety floor (§5) is non-negotiable.
 */
export const generateFromReference = ({
  session,
  dataStream,
  canUsePremium,
}: GenerateFromReferenceProps) =>
  tool({
    description:
      "Generate an image of a SPECIFIC, REAL, named subject by first looking up a real reference photo on the web — so it looks accurate. Use for a real public person, a specific or NEW product/vehicle/gadget, a landmark, or any recent real thing whose exact appearance matters and you may not know it (e.g. 'the Ferrari SF-26 F1 car', 'Adeniyi Abiodun from Mysten Labs', 'the new iPhone 17'). For GENERIC or imaginative subjects (a cat, a dragon, a sunset, a fictional character) use generate_image instead. For a PRIVATE subject not findable online (the user's friend, pet, or home) ask them to upload a photo, then edit_image.",
    inputSchema: z.object({
      subject: z
        .string()
        .describe(
          "The specific real thing to find a reference photo for (e.g. 'Ferrari SF-26 F1 car 2026', 'Adeniyi Abiodun Mysten Labs')."
        ),
      instruction: z
        .string()
        .describe(
          "The image to create from the reference — the full scene / style / framing."
        ),
    }),
    execute: async ({ subject, instruction }) => {
      if (!session?.user) {
        return {
          signInRequired: true as const,
          message:
            "Generating images needs a (free) Audric account — sign in and I'll create it.",
        };
      }

      if (!canUsePremium) {
        const usedToday = await countUserImagesToday(session.user.id);
        if (usedToday >= FREE_DAILY_IMAGE_LIMIT) {
          return {
            limitReached: true as const,
            message: `You've used all ${FREE_DAILY_IMAGE_LIMIT} free images for today. Add credits or upgrade to Pro for more — resets at midnight UTC.`,
          };
        }
      }

      // §5 safety floor — block non-consensual/illegal/defamatory real-person
      // content on every tier, BEFORE any fetch or generation.
      const gate = await classifyReferenceRequest({ subject, instruction });
      if (!gate.allowed) {
        return {
          error: `I can't create that image${gate.reason ? ` — ${gate.reason}` : ""}.`,
        };
      }

      const refUrl = await findReferenceImageUrl(subject);
      const ref = refUrl ? await fetchImageAsBase64(refUrl) : null;
      if (!ref) {
        return {
          noReference: true as const,
          message: `I couldn't find a clear reference photo for "${subject}". If you have one, upload it and I'll work from it.`,
        };
      }

      dataStream.write({ type: "data-kind", data: "image", transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      const out = await editImageBytes(ref.base64, instruction, ref.mediaType);
      if (!out) {
        return {
          error:
            "I found a reference but couldn't generate the image this time — try rephrasing the request.",
        };
      }

      const id = generateUUID();
      await saveDocument({
        id,
        title: instruction,
        content: out,
        kind: "image",
        userId: session.user.id,
        model: IMAGE_EDIT_MODEL,
      });
      dataStream.write({
        type: "data-imageDelta",
        data: out,
        transient: true,
      });
      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        prompt: instruction,
        model: IMAGE_EDIT_MODEL,
        versionIndex: 0,
        content:
          "Generated from a real web reference — it's an AI-generated image. Confirm in 1 sentence and note it's AI-generated from a reference.",
      };
    },
  });
