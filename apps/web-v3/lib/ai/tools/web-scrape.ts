import { tool } from "ai";
import { z } from "zod";

/**
 * web_scrape — read a SPECIFIC web page's full content as clean markdown.
 *
 * Via Jina Reader (`r.jina.ai`) — keyless, free, returns LLM-clean markdown (no
 * DOM noise). The complement to web_search: search FINDS pages, scrape READS one
 * the user names. (Firecrawl on the t2000 rail is the paid/robust upgrade later.)
 */

const JINA = "https://r.jina.ai/";
const MAX_CHARS = 12_000;
const TIMEOUT_MS = 30_000;

export const webScrape = tool({
  description:
    "Read the FULL content of a SPECIFIC web page as clean text/markdown. Use when the user gives a URL or asks to read / summarize / extract from a specific page. This is NOT search — to FIND pages use web_search; use web_scrape once you have the exact URL. Long pages are truncated.",
  inputSchema: z.object({
    url: z.string().describe("The full http(s) URL of the page to read."),
  }),
  execute: async ({ url }) => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      return {
        error:
          "Provide a full http(s) URL (starting with http:// or https://).",
      };
    }
    try {
      const res = await Promise.race([
        fetch(`${JINA}${u}`, { headers: { Accept: "text/plain" } }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("scrape_timeout")), TIMEOUT_MS)
        ),
      ]);
      if (!res.ok) {
        return { error: `Couldn't read that page (${res.status}).`, url: u };
      }
      const text = await res.text();
      const truncated = text.length > MAX_CHARS;
      return {
        url: u,
        content: truncated
          ? `${text.slice(0, MAX_CHARS)}\n\n[Truncated]`
          : text,
        truncated,
        source: "Jina Reader",
      };
    } catch (e) {
      const msg = (e as Error).message;
      return {
        error:
          msg === "scrape_timeout"
            ? "That page took too long to read — try again or a different URL."
            : `Couldn't read that page: ${msg}`,
        url: u,
      };
    }
  },
});
