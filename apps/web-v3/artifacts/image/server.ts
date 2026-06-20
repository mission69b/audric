import {
  gateway,
  experimental_generateImage as generateImage,
  generateText,
} from "ai";
import { createDocumentHandler } from "@/lib/artifacts/server";

// New-image (text→image) model (Gateway). gpt-image-1 = reliable + high quality.
const IMAGE_MODEL = "openai/gpt-image-1";

// IMAGE-TO-IMAGE edit model — Gemini 2.5 Flash Image ("Nano Banana") edits the
// EXISTING image (preserves the subject) instead of regenerating from text. It
// runs THROUGH the Gateway via the multimodal chat path (image-in → image-out),
// so it stays ZDR-consistent with no extra API key (the `/v1/images/edits`
// endpoint isn't proxied by the Gateway; this path is). Verified by
// scripts/image-edit-spike.mts.
const IMAGE_EDIT_MODEL = "google/gemini-2.5-flash-image";

/** Edit `priorBase64` per `instruction` (image-to-image). Returns the edited
 *  PNG base64, or null if the model returned no image (caller falls back). */
async function editImage(
  priorBase64: string,
  instruction: string
): Promise<string | null> {
  const result = await generateText({
    model: gateway.languageModel(IMAGE_EDIT_MODEL),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image", image: priorBase64, mediaType: "image/png" },
        ],
      },
    ],
  });
  const img = (result.files ?? []).find((f) =>
    f.mediaType?.startsWith("image/")
  );
  return img?.base64 ?? null;
}

// Image generation is a premium-tier capability (spec §4b: media gen = credit/
// Pro). For MVP (pre-credit-rail) it's gated to signed-in users — a Passport
// unlock, and it keeps the pricier image calls off the anonymous free tier.
const AUTH_REQUIRED_MESSAGE =
  "Image generation requires signing in — it's a Passport feature.";

export const imageDocumentHandler = createDocumentHandler<"image">({
  kind: "image",
  onCreateDocument: async ({ title, dataStream, session }) => {
    if (!session?.user) {
      throw new Error(AUTH_REQUIRED_MESSAGE);
    }
    const { image } = await generateImage({
      model: gateway.imageModel(IMAGE_MODEL),
      prompt: title,
    });
    dataStream.write({
      type: "data-imageDelta",
      data: image.base64,
      transient: true,
    });
    return image.base64;
  },
  onUpdateDocument: async ({ document, description, dataStream, session }) => {
    if (!session?.user) {
      throw new Error(AUTH_REQUIRED_MESSAGE);
    }
    // TRUE image-to-image edit: send the EXISTING image + the instruction so the
    // model edits the actual logo (preserving it), not regenerate from scratch.
    let base64 = document.content
      ? await editImage(document.content, description)
      : null;
    if (!base64) {
      // Fallback (no prior image / no image returned) — regenerate from an
      // evolved prompt so the subject isn't lost.
      const prompt = document.title
        ? `${document.title}\n\nRevise per this instruction: ${description}`
        : description;
      const { image } = await generateImage({
        model: gateway.imageModel(IMAGE_MODEL),
        prompt,
      });
      base64 = image.base64;
    }
    dataStream.write({
      type: "data-imageDelta",
      data: base64,
      transient: true,
    });
    return base64;
  },
});
