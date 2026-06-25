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
    // Reject only on an EXPLICIT non-zero error. Coerce with Number() because
    // the v3 fear-and-greed endpoint returns error_code as the STRING "0" (not
    // the numeric 0 the standard endpoints use) — a strict !== 0 wrongly rejects
    // it. Absent error_code is also treated as ok.
    const ec = json?.status?.error_code;
    if (ec != null && Number(ec) !== 0) {
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
  id?: number;
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

/**
 * Resolve a free-text query (symbol or name) to the ONE canonical coin (with its
 * live quote). Fetches BOTH symbol AND slug then picks lowest cmc_rank —
 * critical because a real coin's NAME often collides with a memecoin's SYMBOL
 * ("bitcoin" → the BITCOIN scam-token vs BTC; "solana" → a SOLANA memecoin vs
 * SOL). Symbol-first alone returns the impostor; merge + rank lets BTC (rank 1)
 * win over the rank-848 memecoin. Shared by cmcMarket + cmcOhlcv.
 */
async function resolveCoin(query: string): Promise<CmcCoin | null> {
  const q = query.trim();
  if (!q) {
    return null;
  }
  const symbol = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const slug = q
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

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
  return pickByRank(candidates) ?? null;
}

/** Resolve a free-text query (symbol or name) to one coin's live market data. */
export async function cmcMarket(query: string): Promise<CmcMarket | null> {
  const coin = await resolveCoin(query);
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

type ScreenerCoin = {
  name?: string;
  symbol?: string;
  cmc_rank?: number | null;
  date_added?: string;
  quote?: { USD?: UsdQuote };
};
export type ScreenerRow = {
  name?: string;
  symbol?: string;
  priceUsd?: number;
  change24hPct?: number;
  change7dPct?: number;
  marketCapUsd?: number;
  rank?: number | null;
  dateAdded?: string;
};
export type ScreenerKind =
  | "gainers"
  | "losers"
  | "new"
  | "trending"
  | "category";
export type ScreenerResult = {
  label: string;
  results: ScreenerRow[];
  source: "CoinMarketCap";
};

function toRow(c: ScreenerCoin): ScreenerRow {
  const u = c.quote?.USD ?? {};
  return {
    name: c.name,
    symbol: c.symbol?.toUpperCase(),
    priceUsd: u.price,
    change24hPct: u.percent_change_24h,
    change7dPct: u.percent_change_7d,
    marketCapUsd: u.market_cap,
    rank: c.cmc_rank,
    dateAdded: c.date_added,
  };
}

/** Drop junk/untracked rows — no price, or an absurd %change (CMC category
 * lists occasionally surface a bogus token, e.g. null price + 331,197,476%). */
function clean(rows: ScreenerRow[]): ScreenerRow[] {
  return rows.filter(
    (r) =>
      typeof r.priceUsd === "number" &&
      Number.isFinite(r.priceUsd) &&
      r.priceUsd > 0 &&
      (r.change24hPct == null || Math.abs(r.change24hPct) < 1_000_000)
  );
}

/** Screen/rank coins: gainers, losers, new listings, trending, or a category. */
export async function cmcScreener(
  kind: ScreenerKind,
  opts: {
    category?: string;
    timePeriod?: "24h" | "7d" | "30d";
    limit?: number;
  } = {}
): Promise<ScreenerResult | null> {
  const limit = Math.min(Math.max(Math.round(opts.limit ?? 10), 1), 25);
  const tp = opts.timePeriod ?? "24h";

  if (kind === "gainers" || kind === "losers") {
    const data = (await cmcFetch(
      `/v1/cryptocurrency/trending/gainers-losers?time_period=${tp}&sort_dir=${kind === "gainers" ? "desc" : "asc"}&limit=${limit}&convert=USD`
    )) as ScreenerCoin[] | null;
    if (!data?.length) {
      return null;
    }
    return {
      label: `Top ${kind} (${tp})`,
      results: clean(data.map(toRow)),
      source: "CoinMarketCap",
    };
  }
  if (kind === "new") {
    const data = (await cmcFetch(
      `/v1/cryptocurrency/listings/new?limit=${limit}&convert=USD`
    )) as ScreenerCoin[] | null;
    if (!data?.length) {
      return null;
    }
    return {
      label: "Newly listed",
      results: clean(data.map(toRow)),
      source: "CoinMarketCap",
    };
  }
  if (kind === "trending") {
    const data = (await cmcFetch(
      `/v1/cryptocurrency/trending/latest?limit=${limit}&convert=USD`
    )) as ScreenerCoin[] | null;
    if (!data?.length) {
      return null;
    }
    return {
      label: "Trending now",
      results: clean(data.map(toRow)),
      source: "CoinMarketCap",
    };
  }

  // category — match the sector by name, prefer the broadest (highest mcap),
  // then fetch its top coins (e.g. "AI" → "AI & Big Data").
  const q = (opts.category ?? "").trim().toLowerCase();
  if (!q) {
    return null;
  }
  const cats = (await cmcFetch(
    "/v1/cryptocurrency/categories?limit=5000"
  )) as Array<{ id?: string; name?: string; market_cap?: number }> | null;
  // Word-boundary match — a naive substring lets "AI" match "Polych*ai*n
  // Capital Portfolio" (→ BTC/ETH). Require the query as a whole word so "AI"
  // hits "AI & Big Data" / "Generative AI", not "polychain"/"blockchain".
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  const best = (cats ?? [])
    .filter((c) => c.name && re.test(c.name))
    .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))[0];
  if (!best?.id) {
    return null;
  }
  const cat = (await cmcFetch(
    `/v1/cryptocurrency/category?id=${best.id}&limit=${limit}&convert=USD`
  )) as { name?: string; coins?: ScreenerCoin[] } | null;
  const coins = cat?.coins ?? [];
  if (coins.length === 0) {
    return null;
  }
  return {
    label: `Top ${best.name} coins`,
    results: clean(coins.map(toRow)),
    source: "CoinMarketCap",
  };
}

export type CmcGlobal = {
  totalMarketCapUsd?: number;
  totalVolume24hUsd?: number;
  btcDominancePct?: number;
  ethDominancePct?: number;
  altcoinMarketCapUsd?: number;
  defiMarketCapUsd?: number;
  stablecoinMarketCapUsd?: number;
  activeCryptos?: number;
  fearGreedValue?: number;
  fearGreedLabel?: string;
  source: "CoinMarketCap";
};

/** Global crypto market overview + the Fear & Greed sentiment index. */
export async function cmcGlobal(): Promise<CmcGlobal | null> {
  const g = (await cmcFetch("/v1/global-metrics/quotes/latest")) as {
    quote?: {
      USD?: {
        total_market_cap?: number;
        total_volume_24h?: number;
        altcoin_market_cap?: number;
        defi_market_cap?: number;
        stablecoin_market_cap?: number;
      };
    };
    btc_dominance?: number;
    eth_dominance?: number;
    active_cryptocurrencies?: number;
  } | null;
  if (!g) {
    return null;
  }
  const u = g.quote?.USD ?? {};
  const result: CmcGlobal = {
    totalMarketCapUsd: u.total_market_cap,
    totalVolume24hUsd: u.total_volume_24h,
    btcDominancePct: g.btc_dominance,
    ethDominancePct: g.eth_dominance,
    altcoinMarketCapUsd: u.altcoin_market_cap,
    defiMarketCapUsd: u.defi_market_cap,
    stablecoinMarketCapUsd: u.stablecoin_market_cap,
    activeCryptos: g.active_cryptocurrencies,
    source: "CoinMarketCap",
  };
  // Fear & Greed (separate v3 endpoint; non-fatal if it fails).
  const fg = (await cmcFetch("/v3/fear-and-greed/latest")) as {
    value?: number;
    value_classification?: string;
  } | null;
  if (fg && typeof fg.value === "number") {
    result.fearGreedValue = fg.value;
    result.fearGreedLabel = fg.value_classification;
  }
  return result;
}

type OhlcvRow = {
  time_open?: string;
  quote?: {
    USD?: {
      open?: number;
      high?: number;
      low?: number;
      close?: number;
      volume?: number;
      timestamp?: string;
    };
  };
};

export type CmcHistory = {
  name?: string;
  symbol?: string;
  days: number;
  series: {
    date: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volumeUsd?: number;
  }[];
  summary: {
    startUsd?: number;
    endUsd?: number;
    highUsd?: number;
    lowUsd?: number;
    changePct?: number;
  };
  source: "CoinMarketCap";
};

/** Daily OHLCV price history for a coin (resolved canonically), last `days`. */
export async function cmcOhlcv(
  query: string,
  days = 30
): Promise<CmcHistory | null> {
  const coin = await resolveCoin(query);
  if (!coin?.id) {
    return null;
  }
  const count = Math.min(Math.max(Math.round(days), 1), 365);
  const data = (await cmcFetch(
    `/v2/cryptocurrency/ohlcv/historical?id=${coin.id}&count=${count}&interval=daily&convert=USD`
  )) as
    | { quotes?: OhlcvRow[] }
    | Record<string, { quotes?: OhlcvRow[] }>
    | null;

  let rows = (data as { quotes?: OhlcvRow[] } | null)?.quotes;
  if (!rows && data && typeof data === "object") {
    rows = (Object.values(data)[0] as { quotes?: OhlcvRow[] } | undefined)
      ?.quotes;
  }
  if (!rows?.length) {
    return null;
  }

  const series = rows.map((r) => ({
    date: (r.time_open ?? r.quote?.USD?.timestamp ?? "").slice(0, 10),
    open: r.quote?.USD?.open,
    high: r.quote?.USD?.high,
    low: r.quote?.USD?.low,
    close: r.quote?.USD?.close,
    volumeUsd: r.quote?.USD?.volume,
  }));
  const num = (xs: (number | undefined)[]) =>
    xs.filter((n): n is number => typeof n === "number");
  const closes = num(series.map((s) => s.close));
  const highs = num(series.map((s) => s.high));
  const lows = num(series.map((s) => s.low));
  const startUsd = closes[0];
  const endUsd = closes.at(-1);

  return {
    name: coin.name,
    symbol: coin.symbol?.toUpperCase(),
    days: count,
    series,
    summary: {
      startUsd,
      endUsd,
      highUsd: highs.length ? Math.max(...highs) : undefined,
      lowUsd: lows.length ? Math.min(...lows) : undefined,
      changePct:
        startUsd && endUsd ? ((endUsd - startUsd) / startUsd) * 100 : undefined,
    },
    source: "CoinMarketCap",
  };
}
