import { gateway, experimental_generateImage as generateImage } from "ai";
import { createDocumentHandler } from "@/lib/artifacts/server";

// Default image model (Gateway). Swappable — gpt-image-1 is reliable + high
// quality; google/gemini-2.5-flash-image is the fast/cheap alternative.
const IMAGE_MODEL = "openai/gpt-image-1";

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
  onUpdateDocument: async ({ description, dataStream, session }) => {
    if (!session?.user) {
      throw new Error(AUTH_REQUIRED_MESSAGE);
    }
    const { image } = await generateImage({
      model: gateway.imageModel(IMAGE_MODEL),
      prompt: description,
    });
    dataStream.write({
      type: "data-imageDelta",
      data: image.base64,
      transient: true,
    });
    return image.base64;
  },
});
