/**
 * Skills catalog — the consumer-facing registry of Audric's live data skills,
 * powering the /skills discoverability page (AGENT_WEDGE §3a).
 *
 * These are auto-routing capabilities: the agent picks the right tool from
 * natural language (the prompt guidance in `cryptoPrompt`/`stockPrompt` drives
 * it) — this registry is purely for the browse page (what exists + examples to
 * try). "Crypto" fronts CMC (crypto_market = Crypto Market, crypto_history =
 * Crypto History, crypto_screener = Crypto Screener, crypto_global = Market Pulse)
 * + on-chain GeckoTerminal (onchain_trending = On-chain Trending, token_research
 * = Token Research); "Stocks" = stock_analysis (Finnhub). web_search / web_scrape
 * / image gen / the Passport wallet tools are headline always-on features, not
 * catalogued data skills.
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
    slug: "market-pulse",
    name: "Market Pulse",
    category: "Crypto",
    description:
      "The whole market at a glance — total crypto market cap, 24h volume, BTC/ETH dominance, plus the Fear & Greed sentiment index.",
    examples: [
      "Is the crypto market fearful or greedy?",
      "What's the total crypto market cap?",
      "What's Bitcoin's dominance right now?",
    ],
  },
  {
    slug: "onchain-trending",
    name: "On-chain Trending",
    category: "Crypto",
    description:
      "What's moving on a specific chain — trending, top-by-volume, or newly-launched tokens across Sui, Solana, Base, Ethereum, BSC and more.",
    examples: [
      "Top trending tokens on Sui right now",
      "Top tokens by volume on Base",
      "New tokens on Solana",
    ],
  },
  {
    slug: "token-research",
    name: "Token Research",
    category: "Crypto",
    description:
      "Deep-dive any single token — by name, symbol, or contract address — across all chains: live price, liquidity, 24h volume, the DEX it trades on, and the latest news.",
    examples: [
      "Research the MANIFEST token on Sui",
      "What's the liquidity and volume for DEEP on Sui?",
      "Research the WAL token",
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
