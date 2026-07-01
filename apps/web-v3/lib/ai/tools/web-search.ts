import { gateway, generateText, tool } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * web_search — SDK-executed live web search (Audric v3).
 *
 * Two paths, same shape out ({ answer, sources, images }):
 *
 *  1. DIRECT Perplexity API (when PERPLEXITY_API_KEY is set) — returns
 *     `search_results` with real page TITLES (+ url, date) and, with
 *     `return_images`, a handful of RELATED IMAGES from the pages it found.
 *     The Vercel AI Gateway's perplexity path surfaces neither titles nor
 *     images, so the direct call is the only non-hacky way to get both.
 *  2. GATEWAY fallback (no key) — Perplexity Sonar via the Gateway: grounded
 *     answer + source URLs only (no titles, no images). Keyless; bills on the
 *     Gateway credential.
 *
 * Sources carry `date` and the result carries `images` so the client can
 * render Perplexity-style source cards + an image strip (search-results.tsx).
 * Both are presentational pass-throughs — absent/empty degrades to the plain
 * answer + link chips.
 *
 * Why SDK-executed (not the Gateway's provider search tool): provider-executed
 * tools don't trigger the AI SDK's multi-step continuation — models call, get
 * results, and stop WITHOUT synthesizing. Returning the result through the
 * normal loop makes the outer model reliably write the cited answer.
 */

const MAX_ANSWER_CHARS = 4000;
const MAX_IMAGES = 6;

type Source = { url: string; title: string; date?: string };
type SearchImage = { url: string; origin?: string };

function cap(text: string): string {
  return text.length > MAX_ANSWER_CHARS
    ? `${text.slice(0, MAX_ANSWER_CHARS)}…`
    : text;
}

/** Perplexity `images` entries are either bare URL strings or objects —
 * normalize defensively (the shape has shifted across API revisions). */
function normalizeImages(raw: unknown): SearchImage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: SearchImage[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.startsWith("http")) {
      out.push({ url: item });
    } else if (item && typeof item === "object") {
      const o = item as { image_url?: string; origin_url?: string };
      if (typeof o.image_url === "string" && o.image_url.startsWith("http")) {
        out.push({ url: o.image_url, origin: o.origin_url });
      }
    }
    if (out.length >= MAX_IMAGES) {
      break;
    }
  }
  return out;
}

async function searchDirect(
  query: string,
  apiKey: string
): Promise<{ answer: string; sources: Source[]; images: SearchImage[] }> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
      return_images: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`perplexity ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    search_results?: { url?: string; title?: string; date?: string }[];
    citations?: string[];
    images?: unknown;
  };
  const text = data.choices?.[0]?.message?.content ?? "";

  const fromResults: Source[] = (data.search_results ?? [])
    .filter((r): r is { url: string; title?: string; date?: string } =>
      Boolean(r.url)
    )
    .map((r) => ({
      url: r.url,
      title: typeof r.title === "string" ? r.title : "",
      ...(typeof r.date === "string" && r.date ? { date: r.date } : {}),
    }));
  // Fallback to bare citation URLs if the API omitted search_results.
  const sources =
    fromResults.length > 0
      ? fromResults
      : (data.citations ?? []).map((url) => ({ url, title: "" }));

  return { answer: cap(text), sources, images: normalizeImages(data.images) };
}

async function searchGateway(
  query: string
): Promise<{ answer: string; sources: Source[]; images: SearchImage[] }> {
  const { text, sources } = await generateText({
    model: gateway.languageModel("perplexity/sonar"),
    prompt: query,
  });
  const urls: Source[] = (sources ?? []).flatMap((s) =>
    s.sourceType === "url"
      ? [
          {
            url: s.url,
            title: s.title && !/^https?:\/\//.test(s.title) ? s.title : "",
          },
        ]
      : []
  );
  return { answer: cap(text), sources: urls, images: [] };
}

export const webSearch = tool({
  description:
    "Search the web for current, live, or time-sensitive information — news, " +
    "prices, recent events, releases, anything past your training cutoff. " +
    "Returns a grounded summary plus source URLs. Use it whenever the user asks " +
    "about something current; then answer in your own words and cite the sources.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "A clear, self-contained search query (phrase it as a question)."
      ),
  }),
  execute: async ({ query }) => {
    const apiKey = env.PERPLEXITY_API_KEY;
    if (apiKey) {
      try {
        return await searchDirect(query, apiKey);
      } catch {
        // Direct call failed (rate limit / outage) → degrade to the Gateway.
        return await searchGateway(query);
      }
    }
    return await searchGateway(query);
  },
});
