/**
 * Skills catalog — the consumer-facing registry of Audric's live data skills
 * (SPEC_AUDRIC_SKILLS_CATALOG / AGENT_WEDGE §3a). Single source for the /skills
 * browse page AND the composer slash-invoke (`/crypto`, `/stock`, `/scrape`).
 *
 * Skills are FREE (plan/cap monetized) and the agent ALSO auto-routes to them
 * from natural language — this registry just makes them discoverable + invokable.
 *
 * A "skill" here is a substantial, multi-step CAPABILITY (Manus-style), not a
 * primitive tool. "Crypto" fronts BOTH crypto_market (CoinGecko, listed coins)
 * AND crypto_research (DexScreener, any token/contract + trending) — the agent
 * routes by intent, so the user sees one coherent skill. "Stocks" fans out to
 * quote + fundamentals + ratings + earnings + news + peers.
 *
 * NOT skills (deliberately excluded): primitive always-on tools like web_search
 * and web_scrape (read a URL → text) — they have no methodology to load, so they
 * live as core tools, not skill cards (same as image generation).
 *
 * Thin audric-side registry by design — the t2000-skills SKILL.md descriptor
 * home + the agent x402 front is the later, verticalized step (AGENT_WEDGE §1c/§6).
 * NOTE (2026-06-24): these are B-lite tool-backed skills (tool + prompt line) —
 * NOT yet Manus's loaded-`SKILL.md` methodology docs (that engine is deferred).
 * `examples[0]` doubles as the slash-invoke starter prompt; every example is a
 * complete, sendable prompt (the /skills page auto-sends it via ?query=).
 */

export type SkillCategory = "Crypto" | "Markets" | "Web";

export type SkillDef = {
  /** Slash name — typed after "/" in the composer (e.g. `/crypto`). */
  slug: string;
  /** Display name. */
  name: string;
  category: SkillCategory;
  description: string;
  /** Example prompts (each complete + sendable); `examples[0]` seeds slash-invoke. */
  examples: string[];
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
  },
];
