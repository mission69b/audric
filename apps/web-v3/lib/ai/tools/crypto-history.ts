import { tool } from "ai";
import { z } from "zod";
import { cmcOhlcv, isCmcConfigured } from "@/lib/ai/crypto/cmc";
import { gtOhlcv, gtSearch } from "@/lib/ai/crypto/geckoterminal";

/**
 * crypto_history — daily price HISTORY (OHLCV) over the last N days + a summary.
 * Two-source: CoinMarketCap Pro for LISTED coins (canonical), falling back to
 * GeckoTerminal pool candles for DEX-only / long-tail tokens CMC doesn't list
 * (the gap that previously left those tokens with no chartable history). Free +
 * read-only → available to everyone (keys are server-side).
 */
export const cryptoHistory = tool({
  description:
    "Get daily price HISTORY (OHLCV) for a crypto token over the last N days — open/high/low/close per day + a summary (start, end, period high/low, % change). Use for 'how has X done this week/month', 'X price history', 'X over the last 30/90 days', or trend questions. For the CURRENT price + market cap, use crypto_market instead. Works for listed coins (by name/symbol) AND DEX-only tokens — for a DEX/long-tail token pass `chain` so the right pool is picked.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Coin name, symbol, or token — e.g. 'SUI', 'bitcoin', 'VVV'."),
    days: z
      .number()
      .optional()
      .describe(
        "Days of daily history (default 30, max 365). 7 = a week, 30 = a month, 90 = a quarter."
      ),
    chain: z
      .string()
      .optional()
      .describe(
        "Chain for a DEX/long-tail token (e.g. 'sui', 'solana', 'base') — disambiguates the pool when the token isn't a listed coin."
      ),
  }),
  execute: async ({ query, days, chain }) => {
    const window = days ?? 30;
    // 1) CMC — listed coins (canonical).
    if (isCmcConfigured()) {
      try {
        const hist = await cmcOhlcv(query, window);
        if (hist) {
          return hist;
        }
      } catch {
        // fall through to the on-chain source
      }
    }
    // 2) GeckoTerminal — DEX-only / long-tail tokens not on CMC.
    try {
      const search = await gtSearch(query, chain, 1);
      const top = search?.results[0];
      if (top?.poolAddress && top.chain) {
        const gtHist = await gtOhlcv(top.chain, top.poolAddress, window);
        if (gtHist?.series.length) {
          return {
            ...gtHist,
            symbol: top.symbol,
            pool: top.poolAddress,
            chain: top.chain,
            dex: top.dex,
          };
        }
      }
    } catch {
      // fall through to the error
    }
    return {
      error: isCmcConfigured()
        ? `No price history found for "${query}"${chain ? ` on ${chain}` : ""}. Use the exact name/symbol of a listed coin, or pass the chain for a DEX token.`
        : "Price history isn't available right now. I can give the current price + 24h/7d change with crypto_market.",
    };
  },
});
