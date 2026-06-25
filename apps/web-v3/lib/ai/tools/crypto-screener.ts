import { tool } from "ai";
import { z } from "zod";
import { cmcScreener, isCmcConfigured } from "@/lib/ai/crypto/cmc";

/**
 * crypto_screener — rank/discover coins via CoinMarketCap's clean standard API:
 * top gainers/losers, newly-listed coins, trending, or a sector/category (AI,
 * DePIN, RWA…). Replaces the old "fall back to flaky web search" path for these
 * screener questions with structured data. CMC-only → graceful note if unset.
 * Free + read-only → available to everyone.
 */
export const cryptoScreener = tool({
  description:
    "Screen/rank crypto coins. kinds: GAINERS or LOSERS (top movers by %), NEW (recently listed coins), TRENDING (what's hot now), or CATEGORY (top coins in a sector — AI, DePIN, RWA, gaming, memes, Layer 1…). Use for 'top gainers today', 'biggest movers this week', 'new coins / recent launches', 'what's trending', 'top AI coins'. Returns a ranked list (name, symbol, price, % change, market cap, rank). For ONE coin's price use crypto_market; for history use crypto_history; for an arbitrary on-chain CONTRACT/memecoin use dexscreener_token.",
  inputSchema: z.object({
    kind: z
      .enum(["gainers", "losers", "new", "trending", "category"])
      .describe(
        "gainers/losers = top movers by %; new = recently listed; trending = currently trending; category = top coins in a sector."
      ),
    category: z
      .string()
      .optional()
      .describe(
        "Required for kind='category' — the sector name, e.g. 'AI', 'DePIN', 'RWA', 'gaming', 'memes', 'Layer 1'."
      ),
    timePeriod: z
      .enum(["24h", "7d", "30d"])
      .optional()
      .describe("For gainers/losers — the window (default 24h)."),
    limit: z
      .number()
      .optional()
      .describe("How many results (default 10, max 25)."),
  }),
  execute: async ({ kind, category, timePeriod, limit }) => {
    if (!isCmcConfigured()) {
      return {
        error:
          "The crypto screener isn't available right now. I can still look up a specific coin (crypto_market) or research a token (dexscreener_token).",
      };
    }
    if (kind === "category" && !category) {
      return {
        error:
          "Which sector should I screen? e.g. AI, DePIN, RWA, gaming, memes.",
      };
    }
    try {
      const r = await cmcScreener(kind, { category, timePeriod, limit });
      if (!r) {
        return {
          error: `No screener results for ${kind}${category ? ` (${category})` : ""}. Try a different sector or kind.`,
        };
      }
      return r;
    } catch (e) {
      return { error: `Screener lookup failed: ${(e as Error).message}` };
    }
  },
});
