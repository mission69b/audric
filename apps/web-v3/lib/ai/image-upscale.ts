/**
 * Image super-resolution via fal.ai `clarity-upscaler` (SPEC_AUDRIC_IMAGE_PIPELINE
 * §12). Upscaling is image→image, so it is NOT on the Vercel Gateway's text→image
 * `generateImage` interface — it goes direct to fal's sync endpoint. Env-gated
 * (`FAL_API_KEY`): unset → `null` (the tool surfaces a graceful notice). The same
 * key powers the Phase-3 uncensored set, so this bootstraps the fal integration.
 */

import { env } from "@/lib/env";

const UPSCALE_MODEL = "fal-ai/clarity-upscaler";
// clarity-upscaler is diffusion-based super-res — typically 15–40s. Bound it so a
// hung call fails fast (honest "didn't go through") instead of "Thinking…".
const UPSCALE_TIMEOUT_MS = 90_000;
const FETCH_RESULT_TIMEOUT_MS = 30_000;

export function isUpscaleConfigured(): boolean {
  return Boolean(env.FAL_API_KEY);
}

/**
 * Upscale `base64` by `scale`× (2 or 4). Returns the upscaled image base64, or
 * null on any failure (unconfigured / timeout / transport / no output) so the
 * caller can fail honestly and leave the original untouched.
 */
export async function upscaleImageBytes(
  base64: string,
  scale = 2,
  mediaType = "image/png"
): Promise<string | null> {
  const key = env.FAL_API_KEY;
  if (!key) {
    return null;
  }

  let resultUrl: string | undefined;
  try {
    const res = await fetch(`https://fal.run/${UPSCALE_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: `data:${mediaType};base64,${base64}`,
        upscale_factor: scale,
      }),
      signal: AbortSignal.timeout(UPSCALE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[upscale] fal returned ${res.status}`);
      return null;
    }
    const json = (await res.json()) as {
      image?: { url?: string };
      images?: { url?: string }[];
    };
    resultUrl = json.image?.url ?? json.images?.[0]?.url;
  } catch (e) {
    console.error("[upscale] fal request failed:", e);
    return null;
  }
  if (!resultUrl) {
    return null;
  }

  // fal returns a URL to the upscaled image → fetch it back to base64 so it lands
  // in the same private-blob/Document path as generated images.
  try {
    const imgRes = await fetch(resultUrl, {
      signal: AbortSignal.timeout(FETCH_RESULT_TIMEOUT_MS),
    });
    if (!imgRes.ok) {
      return null;
    }
    return Buffer.from(await imgRes.arrayBuffer()).toString("base64");
  } catch (e) {
    console.error("[upscale] fetching the result failed:", e);
    return null;
  }
}
