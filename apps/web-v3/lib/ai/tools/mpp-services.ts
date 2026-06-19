// ⚠️ SHELVED (S.478, 2026-06-17) — NOT wired into the agent. Kept as reference
// for Phase 4b (Recipes). Generic in-chat x402 discovery was cut from MVP.
import { tool } from "ai";
import { z } from "zod";

/**
 * mpp_services — discover x402 Services from the live t2000 gateway catalog
 * (https://mpp.t2000.ai). Read-only, server-side, no wallet. The agent calls
 * this BEFORE mpp_call to get the exact endpoint URL + price + request schema.
 * (Discovery is free — only the eventual mpp_call spends USDC.)
 */

const CATALOG_URL = "https://mpp.t2000.ai/api/services";

type CatalogEndpoint = {
  method: string;
  path: string;
  price: string;
  description?: string;
  schema?: unknown;
};
type CatalogService = {
  id: string;
  name: string;
  serviceUrl: string;
  description?: string;
  categories?: string[];
  endpoints: CatalogEndpoint[];
};

function matches(svc: CatalogService, q: string): boolean {
  const hay = [
    svc.name,
    svc.description ?? "",
    ...(svc.categories ?? []),
    ...svc.endpoints.map((e) => `${e.path} ${e.description ?? ""}`),
  ]
    .join(" ")
    .toLowerCase();
  // Match per-word (AND), not a contiguous substring — so "stock price" finds
  // a "stock quote (price, …)" endpoint. Broadens recall; the LLM picks.
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

export const mppServices = tool({
  description:
    "Discover x402 Services payable in USDC from the user's Passport wallet " +
    "(image gen, search, market data, transcription, email, etc.). Returns " +
    "service names with their exact endpoint URLs, per-call USD price, and " +
    "request body schema. ALWAYS call this before mpp_call so you use the " +
    "correct URL + price + body shape — never guess a URL.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe(
        "Filter by name/category/description (e.g. 'image', 'stock price', 'search'). Omit to list everything."
      ),
  }),
  execute: async ({ query }) => {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) {
      return { error: `Gateway catalog unreachable (HTTP ${res.status}).` };
    }
    const all = (await res.json()) as CatalogService[];
    const filtered = query ? all.filter((s) => matches(s, query)) : all;
    return {
      count: filtered.length,
      services: filtered.map((s) => ({
        name: s.name,
        serviceUrl: s.serviceUrl,
        description: s.description,
        categories: s.categories,
        endpoints: s.endpoints.map((e) => ({
          method: e.method,
          url: `${s.serviceUrl}${e.path}`,
          priceUsd: Number.parseFloat(e.price),
          description: e.description,
          schema: e.schema,
        })),
      })),
    };
  },
});
