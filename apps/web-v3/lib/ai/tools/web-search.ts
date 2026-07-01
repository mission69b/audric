import { gateway, generateText, tool } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * web_search — SDK-executed live web search (Audric v3).
 *
 * Two paths, same shape out ({ answer, sources, images }):
 *
 *  1. DIRECT Perplexity API (when PERPLEXITY_API_KEY is set) — returns
 *     `search_results` with real page TITLES (+ url, date). The Vercel AI
 *     Gateway's perplexity path does NOT surface titles (sources carry only a
 *     url), so this direct call is the only non-hacky way to show titled rows.
 *  2. GATEWAY fallback (no key) — Perplexity Sonar via the Gateway: grounded
 *     answer + source URLs only (no titles). Keyless; bills on the Gateway
 *     credential.
 *
 * Ambient related images come from BRAVE image search (safesearch strict),
 * fetched in PARALLEL with the Sonar call when BRAVE_API_KEY is set — our
 * Perplexity tier doesn't return `return_images`. Direct key by design (never
 * via the t2000 gateway — that rail is x402-metered for agents). Sources carry
 * `date` and the result carries `images` for the Perplexity-style source cards
 * + image strip (search-results.tsx); both degrade to nothing when absent.
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

/** Brave image search (safesearch strict) — the ambient image strip. Never
 * throws: any failure (unset key / rate limit / outage) returns []. Thumbnails
 * are Brave-CDN URLs (hotlink-safe); origin links to the source page. */
async function braveImages(query: string): Promise<SearchImage[]> {
  const key = env.BRAVE_API_KEY;
  if (!key) {
    return [];
  }
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${MAX_IMAGES}&safesearch=strict`,
      { headers: { "X-Subscription-Token": key, Accept: "application/json" } }
    );
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as {
      results?: { url?: string; thumbnail?: { src?: string } }[];
    };
    return (data.results ?? []).flatMap((r) =>
      r.thumbnail?.src ? [{ url: r.thumbnail.src, origin: r.url }] : []
    );
  } catch {
    return [];
  }
}

async function searchDirect(
  query: string,
  apiKey: string
): Promise<{ answer: string; sources: Source[] }> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
    }),
  });
  if (!res.ok) {
    throw new Error(`perplexity ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    search_results?: { url?: string; title?: string; date?: string }[];
    citations?: string[];
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

  return { answer: cap(text), sources };
}

async function searchGateway(
  query: string
): Promise<{ answer: string; sources: Source[] }> {
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
  return { answer: cap(text), sources: urls };
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
    // Answer (Sonar) + ambient images (Brave) run in parallel — images never
    // block or fail the search (braveImages returns [] on any failure).
    const [result, images] = await Promise.all([
      (async () => {
        if (apiKey) {
          try {
            return await searchDirect(query, apiKey);
          } catch {
            // Direct call failed (rate limit / outage) → degrade to the Gateway.
            return await searchGateway(query);
          }
        }
        return await searchGateway(query);
      })(),
      braveImages(query),
    ]);
    return { ...result, images };
  },
});
