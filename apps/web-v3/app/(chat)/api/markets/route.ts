import {
  cmcGlobal,
  cmcOhlcv,
  cmcScreener,
  isCmcConfigured,
} from "@/lib/ai/crypto/cmc";

/**
 * /api/markets — data for the Markets page (the /skills replacement): global
 * pulse + BTC/ETH/SUI 30d history + top movers, all from the SAME CMC lib the
 * chat skills use (single source of truth — no parallel fetch path). Edge-
 * cached: 60s shared TTL + stale-while-revalidate keeps it fresh and cheap
 * (the page is public + identical for everyone).
 */

const CHART_COINS = ["BTC", "ETH", "SUI"] as const;
const CHART_DAYS = 30;
const MOVERS_LIMIT = 5;

export async function GET() {
  if (!isCmcConfigured()) {
    return Response.json(
      { configured: false },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }

  const [global, gainers, losers, trending, ...charts] = await Promise.all([
    cmcGlobal().catch(() => null),
    cmcScreener("gainers", { limit: MOVERS_LIMIT }).catch(() => null),
    cmcScreener("losers", { limit: MOVERS_LIMIT }).catch(() => null),
    cmcScreener("trending", { limit: MOVERS_LIMIT }).catch(() => null),
    ...CHART_COINS.map((c) => cmcOhlcv(c, CHART_DAYS).catch(() => null)),
  ]);

  return Response.json(
    {
      configured: true,
      updatedAt: new Date().toISOString(),
      global,
      movers: {
        gainers: gainers?.results ?? [],
        losers: losers?.results ?? [],
        trending: trending?.results ?? [],
      },
      charts: charts.filter(Boolean),
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
