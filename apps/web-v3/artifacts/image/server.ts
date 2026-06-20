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
 *  PNG base64, or null if the model returned no image after a retry.
 *  The instruction is wrapped to preserve the original style/composition (the
 *  edit model occasionally over-restyles a vague ask like "make it funnier"),
 *  and retried once because it intermittently returns text-only with no image. */
async function editImage(
  priorBase64: string,
  instruction: string
): Promise<string | null> {
  const prompt =
    `Edit the provided image as follows: ${instruction}.\n` +
    "Preserve the original style, medium, composition, lighting, and the existing subjects — change ONLY what the instruction asks.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateText({
      model: gateway.languageModel(IMAGE_EDIT_MODEL),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image", image: priorBase64, mediaType: "image/png" },
          ],
        },
      ],
    });
    const img = (result.files ?? []).find((f) =>
      f.mediaType?.startsWith("image/")
    );
    if (img?.base64) {
      return img.base64;
    }
  }
  return null;
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
    // model edits the actual image (preserving it), not regenerate from scratch.
    const base64 = document.content
      ? await editImage(document.content, description)
      : null;
    if (!base64) {
      // NO silent text-regeneration fallback. When the edit model returned no
      // image, regenerating from the prompt produced a COMPLETELY different
      // subject + style (e.g. a cartoon instead of "the same cats, funnier").
      // Fail honestly so the user keeps their image and can retry.
      throw new Error("IMAGE_EDIT_NO_OUTPUT");
    }
    dataStream.write({
      type: "data-imageDelta",
      data: base64,
      transient: true,
    });
    return base64;
  },
});
