/**
 * Skills catalog — the consumer-facing registry of Audric's live data skills,
 * powering the /skills discoverability page (AGENT_WEDGE §3a).
 *
 * These are auto-routing capabilities: the agent picks the right tool from
 * natural language (the prompt guidance in `cryptoPrompt`/`stockPrompt` drives
 * it) — this registry is purely for the browse page (what exists + examples to
 * try). "Crypto" fronts crypto_market (CoinGecko) + crypto_research (DexScreener);
 * "Stocks" = stock_analysis (Finnhub). web_search / web_scrape / image gen are
 * primitive always-on tools, not catalogued skills.
 *
 * (The explicit-invocation engine — slash/picker/badge/load-on-invoke — was
 * scaled back 2026-06-25: our skills auto-route, so deliberate invocation added
 * complexity without value. Preserved in git; revisit for future
 * methodology-heavy skills that warrant deliberate invocation.)
 */

export type SkillCategory = "Crypto" | "Markets" | "Web";

export type SkillDef = {
  slug: string;
  name: string;
  category: SkillCategory;
  description: string;
  /** Example prompts for the browse page (each complete + sendable). */
  examples: string[];
};

export const SKILLS: SkillDef[] = [
  {
    slug: "crypto",
    name: "Crypto",
    category: "Crypto",
    description:
      "Live prices & market caps, price history/charts, screeners (top gainers, new launches, trending, sector rankings like AI or DePIN), and deep on-chain research on any token — by name, symbol, or contract, any chain.",
    examples: [
      "What's the price of SUI?",
      "Show me ETH's price over the last 30 days",
      "Top crypto gainers this week",
      "What are the top AI coins right now?",
      "Research the MANIFEST token on Sui",
      "Compare the 30-day performance of SUI, SOL and SEI",
    ],
  },
  {
    slug: "stock",
    name: "Stocks",
    category: "Markets",
    description:
      "Live US stock & ETF quotes, fundamentals (P/E, EPS, 52-week range, dividend yield), analyst ratings, recent earnings beats/misses, news, and peers.",
    examples: [
      "What's Apple's stock price?",
      "Research NVDA — fundamentals, ratings and recent news",
      "How has TSLA done lately?",
      "Compare TSLA and AAPL",
    ],
  },
];
