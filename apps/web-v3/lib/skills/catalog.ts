/**
 * Skills catalog — the consumer-facing registry of Audric's live data skills
 * (SPEC_AUDRIC_SKILLS_CATALOG / AGENT_WEDGE §3a). Single source for the /skills
 * browse page, the composer slash-invoke (`/crypto`, `/stock`), AND the
 * load-on-invoke methodology (`instructions`).
 *
 * Manus-style model: a skill is a substantial multi-step CAPABILITY with a
 * `instructions` methodology that the agent LOADS when the skill is explicitly
 * invoked (slash) — progressive disclosure, so it never bloats unrelated turns.
 * Natural-language turns auto-route via the always-on short prompt lines + tool
 * descriptions; explicit invoke loads the full workflow.
 *
 * NOT skills: primitive always-on tools (web_search, web_scrape, image gen) —
 * no methodology to load. "Crypto" fronts BOTH crypto_market (CoinGecko) AND
 * crypto_research (DexScreener); the agent routes by intent.
 *
 * Thin audric-side registry by design — descriptors move to t2000-skills when we
 * verticalize for the agent x402 front (AGENT_WEDGE §1c/§6). `examples[0]` seeds
 * slash-invoke; every example is a complete, sendable prompt.
 */

export type SkillCategory = "Crypto" | "Markets" | "Web";

export type SkillDef = {
  /** Slash name — typed after "/" in the composer (e.g. `/crypto`). */
  slug: string;
  /** Display name. */
  name: string;
  category: SkillCategory;
  /** One-line summary for the card. */
  description: string;
  /** Example prompts (each complete + sendable); `examples[0]` seeds slash-invoke. */
  examples: string[];
  /** Manus-style methodology — injected into the system prompt when the skill is
   * explicitly invoked (load-on-invoke). The agent reads + follows this workflow. */
  instructions: string;
};

export const SKILLS: SkillDef[] = [
  {
    slug: "crypto",
    name: "Crypto",
    category: "Crypto",
    description:
      "Live coin prices & market caps, deep research on any token (by name, symbol or contract — any chain), and trending narratives like 'top AI coins'.",
    examples: [
      "What's the price of SUI?",
      "Research the MANIFEST token on Sui",
      "What are the top AI coins right now?",
      "Compare SUI and SOL market caps",
    ],
    instructions: `# Crypto skill — live market + on-chain research

You have three live crypto tools. Pick by intent (never use web_search for the numbers — these are precise + current):
- \`crypto_market\` (CoinGecko) — a MAJOR LISTED coin's market data: price, market cap + rank, 24h/7d change, volume, ATH. The fast path for top coins.
- \`crypto_research\` / \`dexscreener_token\` — research ANY token by name, symbol, or CONTRACT address, across all chains: price, liquidity, 24h volume, the DEX, socials. For smaller/new/memecoins or a specific contract. Prefer the contract for an exact token; pass \`chain\` when the user names one ("MANIFEST on Sui").
- \`dexscreener_trending\` — trending narratives ("top AI coins", "what's hot"). Call with no arg to LIST narratives (each has a slug), then call again with a slug for that narrative's top tokens.

## Workflow
1. Quick price/market of a known coin → \`crypto_market\` once → answer with the real numbers.
2. "Research <token>" / a contract / a small or new token → \`dexscreener_token\` (pass \`chain\` if named). If it's also a major listed coin, add \`crypto_market\` for market cap/rank.
3. "Top <narrative> coins" / "what's trending" → \`dexscreener_trending\`.
4. DEEP research ("analyze / deep dive / should I look at X"): get the on-chain + market numbers AND call \`web_search\` for the latest narrative / news / catalysts, then synthesize ONE brief: what it is → the numbers → the narrative/why → key risks.

## Best practices
- Use ONLY the current call's numbers; never carry a figure from one token to another.
- Cite the source (CoinGecko / DexScreener) and any news as markdown links.
- Holder counts / distribution are NOT available from these tools — if asked for "top holders", say so and point to a chain explorer (Suivision / SuiScan).
- Multi-token comparisons → a markdown table.
- You are not a financial adviser: present data + balanced analysis, not buy/sell calls.`,
  },
  {
    slug: "stock",
    name: "Stocks",
    category: "Markets",
    description:
      "Live US stock/ETF quote, fundamentals (P/E, EPS, 52-week range), analyst ratings, recent earnings & news.",
    examples: [
      "What's Apple's stock price?",
      "Research NVDA for me",
      "Compare TSLA and AAPL",
    ],
    instructions: `# Stocks skill — live US-equity analysis

Use \`stock_analysis\` (Finnhub) for any US-listed stock or ETF — NOT web_search for the numbers (this is exact + live). One call fans out to: quote + day change, market cap, fundamentals (P/E, EPS, 52-week range, dividend yield, beta), analyst ratings (strong buy / buy / hold / sell), recent earnings beats/misses, recent news headlines, and peer companies.

## Workflow
1. Quick quote → \`stock_analysis\` once → answer with the real numbers.
2. Compare stocks → \`stock_analysis\` per ticker → a markdown table.
3. DEEP research ("research / analyze / should I look at <ticker>"): call \`stock_analysis\` for the hard numbers AND \`web_search\` for the latest catalysts / analyst takes / sentiment, then synthesize a structured brief:
   - **Snapshot** — price, market cap, day move
   - **Fundamentals** — P/E, EPS, 52-week range, dividend, beta
   - **Analyst view** — the buy/hold/sell split + any price targets from search
   - **Recent earnings & news** — beats/misses + a few cited headlines
   - **Bull case / Bear case** — balanced
   - **Bottom line** — one honest paragraph

## Best practices
- US equities only; for non-US tickers or no match, fall back to \`web_search\`.
- Cite "Finnhub" for the numbers and news as markdown links.
- Always give BOTH a bull and bear case on a research request — never one-sided.
- You are not a financial adviser: present data + analysis, never a buy/sell recommendation.`,
  },
];

export function getSkill(slug: string): SkillDef | undefined {
  return SKILLS.find((skill) => skill.slug === slug);
}
