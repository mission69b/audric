/**
 * Recipe catalog (SPEC_AUDRIC_V3 §9 Phase 4b) — curated multi-service OUTCOME
 * flows over live-data x402 services the gateway exposes (news / finance /
 * crypto / weather), priced upfront, paid in USDC via the proven client-sign
 * bridge (`payService`). A Recipe = an ordered set of paid steps + a synthesis
 * instruction the agent uses to turn the collected data into a document
 * artifact.
 *
 * Pure data + pure functions — safe to import on client (runner, Explore page)
 * AND server (the run_recipe tool maps id → recipe). No secrets: the gateway
 * needs no API keys (x402, settled in USDC).
 */

const GATEWAY = "https://mpp.t2000.ai";

export type RecipeInputDef = {
  name: string;
  label: string;
  placeholder: string;
  required?: boolean;
  /** Normalize raw user text before it reaches a step body (e.g. upper-case a ticker). */
  normalize?: (v: string) => string;
};

export type RecipeStepDef = {
  /** Stable key the collected data is filed under (data[key] = response body). */
  key: string;
  /** Service display name (receipt + progress UI). */
  service: string;
  /** Short human label for the step row. */
  label: string;
  url: string;
  method: "POST";
  priceUsd: number;
  /** Build the request body from the (normalized) recipe inputs. */
  body: (inputs: Record<string, string>) => Record<string, unknown>;
};

export type Recipe = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  inputs: RecipeInputDef[];
  steps: RecipeStepDef[];
  /** What the agent should produce from the collected data (drives createDocument). */
  synthesisInstruction: (inputs: Record<string, string>) => string;
};

/** Bundled upfront price = sum of every step's per-call price. */
export function recipePriceUsd(recipe: Recipe): number {
  return recipe.steps.reduce((sum, s) => sum + s.priceUsd, 0);
}

/** Apply each input's normalizer; fill omitted optional inputs with "". */
export function normalizeInputs(
  recipe: Recipe,
  raw: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of recipe.inputs) {
    const v = (raw[def.name] ?? "").trim();
    out[def.name] = def.normalize ? def.normalize(v) : v;
  }
  return out;
}

export const RECIPES: Recipe[] = [
  {
    id: "morning_brief",
    name: "Morning Brief",
    tagline: "Markets, crypto, headlines & weather — one digest",
    description:
      "A skimmable daily brief: top business headlines, the S&P 500, the leading cryptocurrencies, and your local weather — pulled live and synthesized.",
    inputs: [
      {
        name: "city",
        label: "City (for weather)",
        placeholder: "New York",
      },
    ],
    steps: [
      {
        key: "headlines",
        service: "NewsAPI",
        label: "Top business headlines",
        url: `${GATEWAY}/newsapi/v1/headlines`,
        method: "POST",
        priceUsd: 0.02,
        body: () => ({ country: "us", category: "business" }),
      },
      {
        key: "sp500",
        service: "Alpha Vantage",
        label: "S&P 500 (SPY) quote",
        url: `${GATEWAY}/alphavantage/v1/quote`,
        method: "POST",
        priceUsd: 0.02,
        body: () => ({ symbol: "SPY" }),
      },
      {
        key: "crypto",
        service: "CoinGecko",
        label: "Top cryptocurrencies",
        url: `${GATEWAY}/coingecko/v1/markets`,
        method: "POST",
        priceUsd: 0.02,
        body: () => ({
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: "5",
        }),
      },
      {
        key: "weather",
        service: "OpenWeather",
        label: "Local weather",
        url: `${GATEWAY}/openweather/v1/weather`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({ city: inputs.city || "New York" }),
      },
    ],
    synthesisInstruction: (inputs) =>
      `Write a "Morning Brief" document with createDocument (kind: text). Use ONLY the provided data. Structure it as skimmable sections:\n` +
      "- **Markets** — the S&P 500 (SPY) level + day change.\n" +
      "- **Crypto** — the top coins with price + 24h change.\n" +
      "- **Headlines** — 5–7 top business headlines as bullets, each with its source.\n" +
      `- **Weather** — current conditions for ${inputs.city || "New York"}.\n` +
      "Keep it tight and scannable. Note the date. Do not invent data not present.",
  },
  {
    id: "ticker_deep_dive",
    name: "Ticker Deep-Dive",
    tagline: "Live quote + price history + recent news for any stock",
    description:
      "A focused analysis of one stock: the real-time quote, recent daily price action, and the latest news — synthesized into a briefing.",
    inputs: [
      {
        name: "symbol",
        label: "Ticker symbol",
        placeholder: "AAPL",
        required: true,
        normalize: (v) => v.toUpperCase(),
      },
    ],
    steps: [
      {
        key: "quote",
        service: "Alpha Vantage",
        label: "Real-time quote",
        url: `${GATEWAY}/alphavantage/v1/quote`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({ symbol: inputs.symbol }),
      },
      {
        key: "daily",
        service: "Alpha Vantage",
        label: "Daily price history",
        url: `${GATEWAY}/alphavantage/v1/daily`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({ symbol: inputs.symbol, outputsize: "compact" }),
      },
      {
        key: "news",
        service: "NewsAPI",
        label: "Recent news",
        url: `${GATEWAY}/newsapi/v1/search`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({
          q: inputs.symbol,
          language: "en",
          sortBy: "publishedAt",
        }),
      },
    ],
    synthesisInstruction: (inputs) =>
      `Write a "${inputs.symbol} Deep-Dive" document with createDocument (kind: text). Use ONLY the provided data. Structure it as:\n` +
      "- **Snapshot** — current price, day change (% and $), volume.\n" +
      "- **Recent action** — the trend over the last ~2 weeks from the daily series, framed CLOSE-TO-CLOSE (compare closing prices; do NOT treat an intraday high/low as 'the peak' or report the move from a high to a close — that overstates swings). Note genuinely notable closing moves.\n" +
      "- **In the news** — 3–5 recent headlines with sources + dates.\n" +
      "- **Takeaway** — a neutral 1–2 sentence summary. NOT financial advice.\n" +
      `Do not invent data not present. If a section's data is missing, say so briefly.`,
  },
  {
    id: "market_research",
    name: "Market Research",
    tagline: "Size, players, trends & news for any market — cited",
    description:
      "A research-grade brief on any market or industry: estimated size and growth, the key players, current trends, and recent developments — gathered from cited AI search + web + semantic sources and synthesized.",
    inputs: [
      {
        name: "topic",
        label: "Market or industry",
        placeholder: "AI code assistants",
        required: true,
      },
    ],
    steps: [
      {
        key: "overview",
        service: "Perplexity",
        label: "Cited market overview",
        url: `${GATEWAY}/perplexity/v1/chat/completions`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({
          model: "sonar",
          messages: [
            {
              role: "user",
              content: `Give a market-research overview of the "${inputs.topic}" market: estimated size and growth rate, the leading players, the most important current trends, and notable recent developments. Cite sources.`,
            },
          ],
        }),
      },
      {
        key: "web",
        service: "Brave Search",
        label: "Web results",
        url: `${GATEWAY}/brave/v1/web/search`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({
          q: `${inputs.topic} market size growth key players trends`,
        }),
      },
      {
        key: "deep",
        service: "Exa",
        label: "Semantic sources",
        url: `${GATEWAY}/exa/v1/search`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({
          query: `${inputs.topic} market analysis competitive landscape trends`,
          numResults: 6,
        }),
      },
      {
        key: "news",
        service: "Brave Search",
        label: "Recent news",
        url: `${GATEWAY}/brave/v1/news/search`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({ q: inputs.topic }),
      },
    ],
    synthesisInstruction: (inputs) =>
      `Write a "${inputs.topic} — Market Research" document with createDocument (kind: text). Use ONLY the provided data and cite sources inline as markdown links where available. Structure it as:\n` +
      "- **Overview** — what this market is and why it matters.\n" +
      "- **Size & growth** — figures only if present in the data; never invent numbers.\n" +
      "- **Key players** — the notable companies/products named across the sources.\n" +
      "- **Trends** — the most important current dynamics.\n" +
      "- **Recent developments** — 3–5 dated news items with sources.\n" +
      "- **Takeaway** — a neutral 2–3 sentence synthesis.\n" +
      "If a section's data is missing, say so briefly rather than guessing.",
  },
  {
    id: "company_deep_dive",
    name: "Company Deep-Dive",
    tagline: "What a company is, how it makes money & where it stands",
    description:
      "A qualitative deep-dive on any company — public OR private: what it does, its business model, funding/valuation, competitors, and recent milestones — from cited AI research, semantic web sources, and the latest news. (For live stock price + history, use Ticker Deep-Dive.)",
    inputs: [
      {
        name: "company",
        label: "Company name",
        placeholder: "Stripe",
        required: true,
      },
    ],
    steps: [
      {
        key: "profile",
        service: "Perplexity",
        label: "Cited company research",
        url: `${GATEWAY}/perplexity/v1/chat/completions`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({
          model: "sonar",
          messages: [
            {
              role: "user",
              content: `Research the company "${inputs.company}": what it does, its business model and how it makes money, founding and leadership, funding raised or valuation (or market cap if public), main competitors, and recent milestones. Cite sources.`,
            },
          ],
        }),
      },
      {
        key: "web",
        service: "Exa",
        label: "Semantic sources",
        url: `${GATEWAY}/exa/v1/search`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({
          query: `${inputs.company} company business model funding valuation competitors`,
          numResults: 6,
        }),
      },
      {
        key: "news",
        service: "Brave Search",
        label: "Recent news",
        url: `${GATEWAY}/brave/v1/news/search`,
        method: "POST",
        priceUsd: 0.02,
        body: (inputs) => ({ q: inputs.company }),
      },
    ],
    synthesisInstruction: (inputs) =>
      `Write a "${inputs.company} — Company Deep-Dive" document with createDocument (kind: text). Use ONLY the provided data and cite sources inline as markdown links where available. Structure it as:\n` +
      "- **What they do** — the business in 2–3 sentences.\n" +
      "- **Business model** — how they make money.\n" +
      "- **Funding / valuation** — only figures present in the data; never invent.\n" +
      "- **Competitors** — the rivals named across sources.\n" +
      "- **Recent news** — 3–5 dated items with sources.\n" +
      "- **Takeaway** — a neutral 2–3 sentence synthesis. NOT investment advice.\n" +
      "If a section's data is missing, say so briefly rather than guessing.",
  },
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
