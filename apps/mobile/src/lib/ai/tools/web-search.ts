import { gateway, generateText, tool } from "ai";
import { z } from "zod";

// web_search — SDK-executed live web search. Verbatim port of web-v3's
// `lib/ai/tools/web-search.ts`, minus the typed `env` proxy (mobile reads
// `process.env` inside the server-only API route).
//
// Two paths, same shape out ({ answer, sources: [{ url, title }] }):
//   1. DIRECT Perplexity API (when PERPLEXITY_API_KEY is set) — real page TITLES.
//   2. GATEWAY fallback (no key) — Perplexity Sonar via the Vercel AI Gateway:
//      grounded answer + source URLs only. Keyless; bills on the gateway key.
//
// SDK-executed (not the gateway's provider search tool) so the AI SDK's
// multi-step loop runs and the outer model reliably writes the cited answer.

const MAX_ANSWER_CHARS = 4000;

type Source = { url: string; title: string };

function cap(text: string): string {
  return text.length > MAX_ANSWER_CHARS
    ? `${text.slice(0, MAX_ANSWER_CHARS)}…`
    : text;
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
    search_results?: { url?: string; title?: string }[];
    citations?: string[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";

  const fromResults: Source[] = (data.search_results ?? [])
    .filter((r): r is { url: string; title?: string } => Boolean(r.url))
    .map((r) => ({
      url: r.url,
      title: typeof r.title === "string" ? r.title : "",
    }));
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
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (apiKey) {
      try {
        return await searchDirect(query, apiKey);
      } catch {
        // Direct call failed (rate limit / outage) → degrade to the gateway.
        return await searchGateway(query);
      }
    }
    return await searchGateway(query);
  },
});
