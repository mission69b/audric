import "server-only";
import { env } from "@/lib/env";

// Reference-image lookup for grounded generation (SPEC_AUDRIC_IMAGE_PIPELINE
// Path C). Reuses the existing Perplexity key (Sonar `return_images`) — no extra
// provider/key. Behind a thin seam so a dedicated image-search (e.g. Brave) can
// drop in if Perplexity's images are insufficient on our tier.

const MAX_REFERENCE_BYTES = 8 * 1024 * 1024; // 8MB

/** Find a real reference photo URL for a specific subject, or null. */
export async function findReferenceImageUrl(
  subject: string
): Promise<string | null> {
  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "user",
            content: `Find a clear, recent, real photograph of ${subject}.`,
          },
        ],
        return_images: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      images?: Array<{ image_url?: string; url?: string }>;
    };
    const first = (data.images ?? []).find((i) => i.image_url || i.url);
    return first?.image_url ?? first?.url ?? null;
  } catch {
    return null;
  }
}

/** Fetch a remote image as base64 (size + type guarded), or null. */
export async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return null;
    }
    const mediaType = res.headers.get("content-type") ?? "image/jpeg";
    if (!mediaType.startsWith("image/")) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_REFERENCE_BYTES) {
      return null;
    }
    return { base64: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}
