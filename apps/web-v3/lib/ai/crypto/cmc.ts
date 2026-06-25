/**
 * Canonical CoinMarketCap (Pro) fetcher — the crypto skills' primary data source
 * when `CMC_API_KEY` is set (commercial-use Startup tier: canonical quotes,
 * OHLCV, categories). Server-only (the key is server-only via the env gate).
 * When the key is unset, `isCmcConfigured()` is false and callers fall back to
 * the keyless CoinGecko/DexScreener path — so the crypto skills never hard-fail.
 */
import { env } from "@/lib/env";

const CMC = "https://pro-api.coinmarketcap.com";

export function isCmcConfigured(): boolean {
  return Boolean(env.CMC_API_KEY);
}

async function cmcFetch(path: string): Promise<unknown | null> {
  const key = env.CMC_API_KEY;
  if (!key) {
    return null;
  }
  try {
    const res = await fetch(`${CMC}${path}`, {
      headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
    });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      status?: { error_code?: number };
      data?: unknown;
    };
    if (json?.status?.error_code !== 0) {
      return null;
    }
    return json.data ?? null;
  } catch {
    return null;
  }
}

type UsdQuote = {
  price?: number;
  volume_24h?: number;
  percent_change_24h?: number;
  percent_change_7d?: number;
  market_cap?: number;
  market_cap_dominance?: number;
  last_updated?: string;
};
type CmcCoin = {
  name?: string;
  symbol?: string;
  slug?: string;
  cmc_rank?: number | null;
  circulating_supply?: number;
  max_supply?: number | null;
  quote?: { USD?: UsdQuote };
};
type PerfEntry = {
  periods?: { all_time?: { quote?: { USD?: { high?: number } } } };
};

export type CmcMarket = {
  name?: string;
  symbol?: string;
  priceUsd?: number;
  change24hPct?: number;
  change7dPct?: number;
  marketCapUsd?: number;
  marketCapRank?: number | null;
  marketCapDominancePct?: number;
  volume24hUsd?: number;
  circulatingSupply?: number;
  maxSupply?: number | null;
  allTimeHighUsd?: number;
  fromAthPct?: number;
  lastUpdated?: string;
  source: "CoinMarketCap";
};

/** Among coins sharing a symbol, prefer the canonical one (lowest cmc_rank). */
function pickByRank(coins: CmcCoin[]): CmcCoin | undefined {
  if (coins.length === 0) {
    return;
  }
  return [...coins].sort(
    (a, b) => (a.cmc_rank ?? 1e9) - (b.cmc_rank ?? 1e9)
  )[0];
}

/** Resolve a free-text query (symbol or name) to one coin's live market data. */
export async function cmcMarket(query: string): Promise<CmcMarket | null> {
  const q = query.trim();
  if (!q) {
    return null;
  }
  const symbol = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const slug = q
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // Resolve via BOTH symbol AND slug, then pick the canonical coin by lowest
  // cmc_rank. Critical: a real coin's NAME often collides with a memecoin's
  // SYMBOL ("bitcoin" → the BITCOIN scam-token vs BTC; "solana" → a SOLANA
  // memecoin vs SOL). Symbol-first alone returns the impostor; merging both and
  // ranking lets BTC (rank 1) win over the rank-848 memecoin.
  const candidates: CmcCoin[] = [];
  if (symbol) {
    const data = (await cmcFetch(
      `/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol)}&convert=USD`
    )) as Record<string, CmcCoin[] | CmcCoin> | null;
    const entry = data?.[symbol];
    if (Array.isArray(entry)) {
      candidates.push(...entry);
    } else if (entry) {
      candidates.push(entry);
    }
  }
  if (slug) {
    const data = (await cmcFetch(
      `/v1/cryptocurrency/quotes/latest?slug=${encodeURIComponent(slug)}&convert=USD`
    )) as Record<string, CmcCoin> | null;
    if (data) {
      candidates.push(...Object.values(data));
    }
  }
  const coin = pickByRank(candidates);
  if (!coin) {
    return null;
  }

  const u = coin.quote?.USD ?? {};
  const market: CmcMarket = {
    name: coin.name,
    symbol: coin.symbol?.toUpperCase(),
    priceUsd: u.price,
    change24hPct: u.percent_change_24h,
    change7dPct: u.percent_change_7d,
    marketCapUsd: u.market_cap,
    marketCapRank: coin.cmc_rank,
    marketCapDominancePct: u.market_cap_dominance,
    volume24hUsd: u.volume_24h,
    circulatingSupply: coin.circulating_supply,
    maxSupply: coin.max_supply,
    lastUpdated: u.last_updated,
    source: "CoinMarketCap",
  };

  // ATH + % from peak — a 2nd lightweight call (the agent surfaces this line).
  if (coin.symbol) {
    const perf = (await cmcFetch(
      `/v2/cryptocurrency/price-performance-stats/latest?symbol=${encodeURIComponent(coin.symbol)}&convert=USD`
    )) as Record<string, PerfEntry[] | PerfEntry> | null;
    const entry = perf?.[coin.symbol];
    const arr = Array.isArray(entry) ? entry : entry ? [entry] : [];
    const ath = arr[0]?.periods?.all_time?.quote?.USD?.high;
    if (typeof ath === "number" && ath > 0) {
      market.allTimeHighUsd = ath;
      if (typeof market.priceUsd === "number") {
        market.fromAthPct = ((market.priceUsd - ath) / ath) * 100;
      }
    }
  }

  return market;
}
