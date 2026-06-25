import { tool } from "ai";
import { z } from "zod";
import { cmcGlobal, isCmcConfigured } from "@/lib/ai/crypto/cmc";

/**
 * crypto_global — overall crypto MARKET overview + sentiment, via CoinMarketCap:
 * total market cap, 24h volume, BTC/ETH dominance, DeFi & stablecoin caps, and
 * the Fear & Greed Index. Common questions with no clean structured source via
 * web search. CMC-only → graceful note if unset. Free + read-only.
 */
export const cryptoGlobal = tool({
  description:
    "Overall crypto MARKET overview + sentiment — total crypto market cap, 24h volume, BTC & ETH dominance, DeFi/stablecoin market caps, and the Fear & Greed Index (0–100 + label like 'Extreme fear'/'Greed'). Use for 'total crypto market cap', 'BTC dominance', 'is the market in fear or greed', 'crypto market sentiment', 'how's the overall market'. For a SINGLE coin use crypto_market.",
  inputSchema: z.object({}),
  execute: async () => {
    if (!isCmcConfigured()) {
      return {
        error: "Crypto market-overview data isn't available right now.",
      };
    }
    try {
      const g = await cmcGlobal();
      if (!g) {
        return {
          error: "Couldn't fetch the crypto market overview right now.",
        };
      }
      return g;
    } catch (e) {
      return { error: `Market overview failed: ${(e as Error).message}` };
    }
  },
});
