import { tool } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * stock_analysis — LIVE, structured US-equity data via Finnhub.
 *
 * The stocks analog of `crypto_market` (SPEC_AUDRIC_SKILLS_CATALOG §3). Unlike
 * the crypto/scrape skills, stocks have NO reliable keyless feed (Yahoo + Stooq
 * are both server-IP-blocked, confirmed 2026-06-24) — so this is the one data
 * skill that needs a key (`FINNHUB_API_KEY`). It's still FREE to the user
 * (bounded by the existing daily cap, like every skill); key unset → a graceful
 * "not configured" notice.
 *
 * One call fans out to quote + profile + fundamentals + analyst ratings and
 * returns a single synthesized shape the model narrates in its own words.
 */

const FINNHUB = "https://finnhub.io/api/v1";

type SearchResult = { symbol?: string; description?: string; type?: string };
type Quote = {
  c?: number; // current price
  d?: number; // change
  dp?: number; // change percent
  h?: number; // day high
  l?: number; // day low
  pc?: number; // previous close
};
type Profile = {
  name?: string;
  exchange?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number; // in millions of the listing currency
  currency?: string;
  weburl?: string;
  ipo?: string;
};
type Metric = { metric?: Record<string, number | null> };
type Reco = {
  buy?: number;
  hold?: number;
  sell?: number;
  strongBuy?: number;
  strongSell?: number;
  period?: string;
};
type News = {
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  datetime?: number; // unix seconds
};
type Earnings = {
  period?: string;
  estimate?: number;
  actual?: number;
  surprisePercent?: number;
};

const NEWS_LOOKBACK_DAYS = 10;
const MAX_NEWS = 5;
const MAX_EARNINGS = 4;
const MAX_PEERS = 6;
const SUMMARY_CHARS = 180;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fh<T>(path: string, token: string): Promise<T | null> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${FINNHUB}${path}${sep}token=${token}`);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Resolve a free-text query ("Apple", "AAPL") to the best US-listed symbol:
 * prefer an exact ticker match, then a plain common stock (no dotted foreign
 * suffix), else the first result. */
function pickSymbol(
  results: SearchResult[],
  query: string
): SearchResult | undefined {
  if (results.length === 0) {
    return;
  }
  const q = query.trim().toUpperCase();
  const exact = results.find((r) => r.symbol?.toUpperCase() === q);
  if (exact) {
    return exact;
  }
  const common = results.find(
    (r) => r.type === "Common Stock" && !r.symbol?.includes(".")
  );
  return common ?? results[0];
}

export const stockAnalysis = tool({
  description:
    "Get LIVE, in-depth data for a US-listed STOCK or ETF — current price + day change, market cap, P/E, EPS, 52-week range, dividend yield, beta, analyst buy/hold/sell ratings, recent earnings beats/misses, recent news headlines, and peer companies. More precise and current than web_search for any 'price/quote of <ticker>', 'how is <company> stock doing', valuation, earnings, or compare-stocks question. Pass the company name OR ticker. Call once per ticker. For a DEEP 'research / analyze / should I look at <stock>' request, ALSO call web_search for the latest catalysts/sentiment, then synthesize both.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Company name or ticker — e.g. 'Apple', 'AAPL', 'NVDA'."),
  }),
  execute: async ({ query }) => {
    const token = env.FINNHUB_API_KEY;
    if (!token) {
      return {
        error:
          "Stock data isn't configured right now — I can still look it up via web search if you'd like.",
      };
    }

    const search = await fh<{ result?: SearchResult[] }>(
      `/search?q=${encodeURIComponent(query)}`,
      token
    );
    const picked = pickSymbol(search?.result ?? [], query);
    if (!picked?.symbol) {
      return {
        error: `No US-listed stock found for "${query}". For non-US tickers, try web search.`,
      };
    }
    const symbol = picked.symbol;
    const to = new Date();
    const from = new Date(Date.now() - NEWS_LOOKBACK_DAYS * 864e5);

    const [quote, profile, metricRes, recos, news, earnings, peers] =
      await Promise.all([
        fh<Quote>(`/quote?symbol=${symbol}`, token),
        fh<Profile>(`/stock/profile2?symbol=${symbol}`, token),
        fh<Metric>(`/stock/metric?symbol=${symbol}&metric=all`, token),
        fh<Reco[]>(`/stock/recommendation?symbol=${symbol}`, token),
        fh<News[]>(
          `/company-news?symbol=${symbol}&from=${ymd(from)}&to=${ymd(to)}`,
          token
        ),
        fh<Earnings[]>(`/stock/earnings?symbol=${symbol}`, token),
        fh<string[]>(`/stock/peers?symbol=${symbol}`, token),
      ]);

    if (!quote?.c) {
      return { error: `Couldn't fetch a live quote for ${symbol}.` };
    }

    const m = metricRes?.metric ?? {};
    const r = recos?.[0];
    const capM = profile?.marketCapitalization;

    return {
      symbol,
      name: profile?.name ?? picked.description,
      exchange: profile?.exchange,
      industry: profile?.finnhubIndustry,
      currency: profile?.currency ?? "USD",
      priceUsd: quote.c,
      change24h: quote.d,
      change24hPct: quote.dp,
      dayHigh: quote.h,
      dayLow: quote.l,
      prevClose: quote.pc,
      marketCapUsd: typeof capM === "number" ? capM * 1e6 : null,
      week52High: m["52WeekHigh"] ?? null,
      week52Low: m["52WeekLow"] ?? null,
      peTTM: m.peTTM ?? m.peBasicExclExtraTTM ?? null,
      epsTTM: m.epsTTM ?? null,
      dividendYieldPct:
        m.dividendYieldIndicatedAnnual ?? m.currentDividendYieldTTM ?? null,
      beta: m.beta ?? null,
      analystRatings: r
        ? {
            strongBuy: r.strongBuy,
            buy: r.buy,
            hold: r.hold,
            sell: r.sell,
            strongSell: r.strongSell,
            period: r.period,
          }
        : null,
      recentEarnings: (earnings ?? []).slice(0, MAX_EARNINGS).map((e) => ({
        period: e.period,
        epsEstimate: e.estimate,
        epsActual: e.actual,
        surprisePct: e.surprisePercent,
      })),
      recentNews: (news ?? []).slice(0, MAX_NEWS).map((n) => ({
        headline: n.headline,
        source: n.source,
        date: n.datetime ? ymd(new Date(n.datetime * 1000)) : undefined,
        url: n.url,
        summary: n.summary?.slice(0, SUMMARY_CHARS),
      })),
      peers: (peers ?? []).filter((p) => p !== symbol).slice(0, MAX_PEERS),
      website: profile?.weburl,
      source: "Finnhub",
    };
  },
});
