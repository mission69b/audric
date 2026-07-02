import { tool } from "ai";
import { z } from "zod";
import { braveImageSearch, isBraveConfigured } from "@/lib/ai/brave";

/**
 * image_search — dedicated VISUAL search (Brave image vertical, safesearch
 * strict) for explicit "show me / what does X look like" intent. The UI
 * renders the result as an image grid (image-search-results.tsx); web_search's
 * ambient strip covers info queries, this covers image-first ones.
 *
 * Free like the other search skills. Unset BRAVE_API_KEY → a graceful notice
 * (never a dead-end).
 */

const RESULT_COUNT = 12;

export const imageSearch = tool({
  description:
    "Search the web for IMAGES — use when the user explicitly wants to SEE " +
    "something: 'show me images/photos/pictures of X', 'what does X look " +
    "like'. Returns a grid of image results rendered in the UI. NOT for " +
    "generating new images (generate_image) and NOT for news/info questions " +
    "(web_search).",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "What to find images of — a concrete subject, e.g. 'Sydney Opera House at night'."
      ),
  }),
  execute: async ({ query }) => {
    if (!isBraveConfigured()) {
      return {
        error:
          "Image search isn't configured right now. I can describe it, search the web for it, or generate an image instead.",
      };
    }
    const images = await braveImageSearch(query, RESULT_COUNT);
    if (images.length === 0) {
      return {
        query,
        images: [],
        note: "No image results found — try rephrasing the subject.",
      };
    }
    return { query, images };
  },
});
