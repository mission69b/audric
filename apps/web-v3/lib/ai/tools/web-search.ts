import { gateway, generateText, tool } from "ai";
import { z } from "zod";

/**
 * web_search — SDK-executed live web search (Audric v3).
 *
 * Why custom (not the Gateway's `perplexitySearch` provider tool): provider-
 * executed tools don't trigger the AI SDK's multi-step continuation, so our
 * models call the tool, get results, and stop WITHOUT synthesizing (verified:
 * finishReason 'tool-calls', no text). An SDK-executed tool (this) returns its
 * result through the normal loop, so the outer model reliably writes the answer
 * — on ANY model.
 *
 * The execute runs Perplexity Sonar through the Gateway (native search + grounded
 * answer + source URLs), so there's NO extra API key — it's billed on the same
 * Gateway credential as the chat models.
 */
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
    const { text, sources } = await generateText({
      model: gateway.languageModel("perplexity/sonar"),
      prompt: query,
    });

    const urls = (sources ?? []).flatMap((s) =>
      s.sourceType === "url" ? [{ url: s.url, title: s.title ?? s.url }] : []
    );

    return { answer: text, sources: urls };
  },
});
