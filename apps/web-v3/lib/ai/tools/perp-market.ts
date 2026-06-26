import { tool } from "ai";
import { z } from "zod";
import { getBluefinPerp, listBluefinPerps } from "@/lib/ai/crypto/bluefin";

/**
 * perp_market — live perpetual-futures data from Bluefin (Sui's perps DEX): mark
 * price, funding (per 8h), open interest, 24h change/range/volume. The read layer
 * for the "analyze a perp setup" probe (SPEC_AUDRIC_COMPUTER Phase 1). Free +
 * read-only (public endpoint; no auth/account → sidesteps Bluefin's US-geo). NOT
 * advice — the agent presents data + the setup + risks; the user decides.
 */
export const perpMarket = tool({
  description:
    "Live PERPETUAL FUTURES market data from Bluefin (Sui's perps DEX) — mark price, funding rate (per 8h), open interest, 24h change/range/volume. Use for perp / leverage / funding questions: 'how's the SUI perp', 'what's funding on BTC', 'analyze a SUI long at 5x'. Listed markets: BTC, ETH, SOL, SUI, DEEP, WAL, HYPE, GOLD. Omit `query` to list all. This is DATA, NOT financial advice — present the setup + funding + liquidation math + risks; never tell the user to take a trade.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe(
        "Perp symbol — e.g. 'SUI', 'BTC', 'ETH'. Omit to list all Bluefin perps."
      ),
  }),
  execute: async ({ query }) => {
    try {
      if (!query) {
        return { source: "Bluefin", markets: await listBluefinPerps() };
      }
      const market = await getBluefinPerp(query);
      if (!market) {
        const all = await listBluefinPerps();
        return {
          error: `Bluefin doesn't list a "${query}" perp. Available: ${all
            .map((m) => m.symbol.replace("-PERP", ""))
            .join(", ")}.`,
        };
      }
      return { source: "Bluefin", market };
    } catch {
      return {
        error:
          "I couldn't reach Bluefin perp data right now — please try again in a moment.",
      };
    }
  },
});
