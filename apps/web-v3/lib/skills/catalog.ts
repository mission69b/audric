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
    slug: "crypto-market",
    name: "Crypto Market",
    category: "Crypto",
    description:
      "Live price, market cap, rank, 24h/7d change, volume and all-time high for any listed coin.",
    examples: [
      "What's the price of SUI?",
      "How's Bitcoin doing today?",
      "Compare SUI and SOL market caps",
    ],
  },
  {
    slug: "crypto-history",
    name: "Crypto History",
    category: "Crypto",
    description:
      "Daily price history (OHLCV) over any window — the trend, highs/lows and % change.",
    examples: [
      "Show me ETH's price over the last 30 days",
      "How has SUI performed this week?",
      "Compare the 30-day performance of SUI, SOL and SEI",
    ],
  },
  {
    slug: "crypto-screener",
    name: "Crypto Screener",
    category: "Crypto",
    description:
      "Rank & discover — top gainers/losers, newly-listed coins, what's trending, or the top coins in a sector (AI, DePIN, RWA, gaming…).",
    examples: [
      "Top crypto gainers this week",
      "What are the top AI coins right now?",
      "Any new coins launched recently?",
    ],
  },
  {
    slug: "token-research",
    name: "Token Research",
    category: "Crypto",
    description:
      "Deep on-chain data for any token — by name, symbol, or contract address — across Sui, Solana, Ethereum, Base and more: price, liquidity, volume, DEX and socials.",
    examples: [
      "Research the MANIFEST token on Sui",
      "Top trending tokens on Base right now",
      "Find on-chain liquidity & volume for a token by contract address",
    ],
  },
  {
    slug: "stocks",
    name: "Stocks",
    category: "Markets",
    description:
      "Live US stock & ETF quotes, fundamentals (P/E, EPS, 52-week range, dividend yield), analyst ratings, recent earnings, news and peers.",
    examples: [
      "What's Apple's stock price?",
      "Research NVDA — fundamentals, ratings and recent news",
      "Compare TSLA and AAPL",
    ],
  },
];
