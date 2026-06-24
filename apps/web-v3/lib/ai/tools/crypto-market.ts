import { tool } from "ai";
import { z } from "zod";

/**
 * crypto_market — LIVE, structured crypto market data via CoinGecko.
 *
 * The first wedge "skill" (SPEC_AUDRIC_AGENT_WEDGE §0.5/§6 P0): validates whether
 * a structured data skill beats free `web_search` for crypto queries. web_search
 * (Sonar) returns prose that's often stale/imprecise on live prices; this returns
 * exact, current numbers (price, 24h/7d change, market cap + rank, volume, ATH).
 *
 * v1 is FREE + keyless (CoinGecko public API, rate-limited) + Audric-direct — the
 * cheapest validation per the spec. Credit metering + the gateway/x402 fronts
 * (§1c) follow only once usage is confirmed. No auth needed → available to anon.
 */

const COINGECKO = "https://api.coingecko.com/api/v3";

type SearchCoin = {
  id: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number | null;
};

type MarketRow = {
  name?: string;
  symbol?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number | null;
  total_volume?: number;
  high_24h?: number;
  low_24h?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  ath?: number;
  ath_change_percentage?: number;
  last_updated?: string;
};

/** Pick the best coin for a query: prefer an exact symbol match with the best
 * (lowest) market-cap rank, else the highest-ranked result — avoids matching a
 * low-cap impostor that shares a name/symbol. */
function pickCoin(coins: SearchCoin[], query: string): SearchCoin | undefined {
  if (coins.length === 0) {
    return;
  }
  const q = query.trim().toLowerCase();
  const ranked = [...coins].sort(
    (a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9)
  );
  const exactSymbol = ranked.find((c) => c.symbol?.toLowerCase() === q);
  return exactSymbol ?? ranked[0];
}

export const cryptoMarket = tool({
  description:
    "Get LIVE, structured crypto market data for a coin/token — exact current price, 24h & 7d change, market cap + rank, 24h volume, all-time high. More precise and current than web_search for any 'price of X', 'how is X doing', market-cap, or compare-coins question. Call once per coin. Then answer in your own words with the real numbers.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Coin name, symbol, or id — e.g. 'SUI', 'bitcoin', 'ETH'."),
  }),
  execute: async ({ query }) => {
    try {
      const searchRes = await fetch(
        `${COINGECKO}/search?query=${encodeURIComponent(query)}`
      );
      if (!searchRes.ok) {
        return {
          error: `Market data unavailable (search ${searchRes.status}).`,
        };
      }
      const search = (await searchRes.json()) as { coins?: SearchCoin[] };
      const coin = pickCoin(search.coins ?? [], query);
      if (!coin) {
        return { error: `No coin found for "${query}".` };
      }

      const marketRes = await fetch(
        `${COINGECKO}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
          coin.id
        )}&price_change_percentage=24h%2C7d`
      );
      if (!marketRes.ok) {
        return {
          error: `Market data unavailable (markets ${marketRes.status}).`,
        };
      }
      const rows = (await marketRes.json()) as MarketRow[];
      const m = rows[0];
      if (!m) {
        return { error: `No market data for ${coin.name ?? query}.` };
      }

      return {
        name: m.name,
        symbol: m.symbol?.toUpperCase(),
        priceUsd: m.current_price,
        change24hPct:
          m.price_change_percentage_24h_in_currency ??
          m.price_change_percentage_24h,
        change7dPct: m.price_change_percentage_7d_in_currency,
        marketCapUsd: m.market_cap,
        marketCapRank: m.market_cap_rank,
        volume24hUsd: m.total_volume,
        high24hUsd: m.high_24h,
        low24hUsd: m.low_24h,
        allTimeHighUsd: m.ath,
        fromAthPct: m.ath_change_percentage,
        lastUpdated: m.last_updated,
        source: "CoinGecko",
      };
    } catch (e) {
      return { error: `Market data lookup failed: ${(e as Error).message}` };
    }
  },
});
