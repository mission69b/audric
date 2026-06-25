import { tool } from "ai";
import { z } from "zod";
import { cmcOhlcv, isCmcConfigured } from "@/lib/ai/crypto/cmc";

/**
 * crypto_history — daily price HISTORY (OHLCV) for a listed coin, via
 * CoinMarketCap Pro. The price-history capability CoinGecko-keyless/DexScreener
 * don't give cleanly. CMC-only → degrades to a graceful note when CMC_API_KEY is
 * unset (crypto_market still covers current price + 24h/7d change). Free +
 * read-only → available to everyone (the key is server-side).
 */
export const cryptoHistory = tool({
  description:
    "Get daily price HISTORY (OHLCV) for a crypto coin over the last N days — open/high/low/close per day + a summary (start, end, period high/low, % change). Use for 'how has X done this week/month', 'X price history', 'X over the last 30/90 days', or trend questions. For the CURRENT price + market cap, use crypto_market instead. Listed/major coins only (by name or symbol).",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Coin name or symbol — e.g. 'SUI', 'bitcoin', 'ETH'."),
    days: z
      .number()
      .optional()
      .describe(
        "Days of daily history (default 30, max 365). 7 = a week, 30 = a month, 90 = a quarter."
      ),
  }),
  execute: async ({ query, days }) => {
    if (!isCmcConfigured()) {
      return {
        error:
          "Price history isn't available right now. I can give the current price + 24h/7d change with crypto_market, or link to a live chart.",
      };
    }
    try {
      const hist = await cmcOhlcv(query, days ?? 30);
      if (!hist) {
        return {
          error: `No price history found for "${query}". Use the exact name or symbol of a listed coin.`,
        };
      }
      return hist;
    } catch (e) {
      return { error: `Price history lookup failed: ${(e as Error).message}` };
    }
  },
});
