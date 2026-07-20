import { tool } from "ai";
import { z } from "zod";
import { getMppCatalog } from "@/lib/ai/mpp-catalog";

/**
 * find_paid_services — read-only catalog lookup (server-execute, no spend).
 *
 * Returns matching services with their endpoints, exact per-call prices, and
 * request-body JSON schemas so the agent can (a) offer with the real price
 * and (b) build a VALID body — several direct sellers charge before
 * validating, so a guessed body is a paid failure. Payment itself is the
 * separate, user-confirmed pay_service step.
 */
export const findPaidServices = tool({
  description:
    "Search the t2000 paid-services catalog (mpp.t2000.ai) — external APIs the user's wallet can pay per call in USDC: travel (hotels/flights), image generation, TTS, web search, LLMs, data feeds, physical mail. Returns endpoints, exact prices, and request-body schemas. Read-only, costs nothing. Use it BEFORE offering a paid call; build the request body from the returned schema.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "What the user needs, e.g. 'luxury hotel search', 'text to speech', 'send physical mail'."
      ),
  }),
  execute: async ({ query }) => {
    const catalog = await getMppCatalog();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = catalog
      .map((s) => {
        const hay =
          `${s.name} ${s.id} ${s.description} ${s.categories.join(" ")} ${s.endpoints
            .map((e) => e.description)
            .join(" ")}`.toLowerCase();
        const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
        return { s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (scored.length === 0) {
      return {
        matches: [],
        note: "No catalog service matches — answer with your own tools and say so.",
      };
    }
    return {
      matches: scored.map(({ s }) => ({
        serviceId: s.id,
        name: s.name,
        description: s.description,
        kind: s.direct
          ? "direct seller — settles straight to the seller, NO automatic refund"
          : "proxied — no charge if the call fails",
        endpoints: s.endpoints.map((e) => ({
          method: e.method,
          path: e.path,
          description: e.description,
          priceUsdc: e.price,
          // Body schema (when the seller publishes one) — build the request
          // body from THIS, never guess field names.
          requestSchema: e.schema,
          // Copyable template — REQUIRED shape for pay_service's `body`
          // argument. Weaker models skipped body-building from the schema
          // alone (two founder turns, 2026-07-21); a literal fill-in string
          // is harder to drop.
          bodyTemplate: e.sampleBody,
          // Declared deliverable contract (when the seller publishes one) —
          // what a paid call returns, so you can tell the user what they'll
          // get BEFORE they pay.
          responseSchema: e.responseSchema,
        })),
      })),
    };
  },
});
