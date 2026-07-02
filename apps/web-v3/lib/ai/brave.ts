import { env } from "@/lib/env";

/**
 * Brave Image Search — shared by web_search's ambient image strip and the
 * dedicated image_search tool. DIRECT key by design (never via the t2000
 * gateway — that rail is x402-metered for agents). safesearch is ALWAYS
 * strict (App Store 16+ posture). Never throws: unset key / rate limit /
 * outage → [] (callers degrade gracefully).
 *
 * Thumbnails are Brave-CDN URLs (hotlink-safe); `origin` is the source page.
 */

export type BraveImage = { url: string; origin?: string; title?: string };

export async function braveImageSearch(
  query: string,
  count: number
): Promise<BraveImage[]> {
  const key = env.BRAVE_API_KEY;
  if (!key) {
    return [];
  }
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${count}&safesearch=strict`,
      { headers: { "X-Subscription-Token": key, Accept: "application/json" } }
    );
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as {
      results?: {
        title?: string;
        url?: string;
        thumbnail?: { src?: string };
      }[];
    };
    return (data.results ?? []).flatMap((r) =>
      r.thumbnail?.src
        ? [{ url: r.thumbnail.src, origin: r.url, title: r.title }]
        : []
    );
  } catch {
    return [];
  }
}

export function isBraveConfigured(): boolean {
  return Boolean(env.BRAVE_API_KEY);
}
