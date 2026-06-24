/**
 * Skills catalog — the consumer-facing registry of Audric's live data skills
 * (SPEC_AUDRIC_SKILLS_CATALOG / AGENT_WEDGE §3a). This is the single source for
 * the /skills browse page AND the composer slash-invoke (`/crypto`, `/stock`…).
 *
 * Skills are FREE (plan/cap monetized) and the agent ALSO auto-routes to them
 * from natural language — this registry just makes them discoverable + invokable.
 * Thin audric-side registry by design (the t2000-skills SKILL.md descriptor home
 * + the agent x402 front is the later, verticalized step — AGENT_WEDGE §1c/§6).
 *
 * `examples[0]` doubles as the slash-invoke starter prompt.
 */

export type SkillCategory = "Crypto" | "Markets" | "Web";

export type SkillDef = {
  /** Slash name — typed after "/" in the composer (e.g. `/crypto`). */
  slug: string;
  /** Display name. */
  name: string;
  /** Underlying tool id (reference; the agent owns routing). */
  toolId: string;
  category: SkillCategory;
  description: string;
  /** Example prompts for the browse page; `examples[0]` seeds slash-invoke. */
  examples: string[];
};

export const SKILLS: SkillDef[] = [
  {
    slug: "crypto",
    name: "Crypto market",
    toolId: "crypto_market",
    category: "Crypto",
    description:
      "Live price, market cap, 24h/7d change, volume & all-time-high for any major coin.",
    examples: [
      "What's the price of SUI?",
      "How is Bitcoin doing today?",
      "Compare SUI and SOL market caps",
    ],
  },
  {
    slug: "token",
    name: "Token research",
    toolId: "crypto_research",
    category: "Crypto",
    description:
      "Research any token by name, symbol or contract — across all chains — plus trending narratives like 'top AI coins'.",
    examples: [
      "Research the MANIFEST token on Sui",
      "What are the top AI coins right now?",
      "Look up this contract for me: 0x…",
    ],
  },
  {
    slug: "stock",
    name: "Stock analysis",
    toolId: "stock_analysis",
    category: "Markets",
    description:
      "Live US stock/ETF quote, fundamentals (P/E, EPS, 52w range), analyst ratings, recent earnings & news.",
    examples: [
      "What's Apple's stock price?",
      "Research NVDA for me",
      "Compare TSLA and AAPL",
    ],
  },
  {
    slug: "scrape",
    name: "Read a page",
    toolId: "web_scrape",
    category: "Web",
    description:
      "Read a specific URL and return clean text — summarize or extract from any web page.",
    examples: [
      "Summarize https://blog.sui.io",
      "Read https://example.com and give me the key points",
    ],
  },
];

export const SKILL_CATEGORIES: SkillCategory[] = ["Crypto", "Markets", "Web"];
