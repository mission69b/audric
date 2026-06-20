export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// Composer chips — CONCRETE, capability-showcasing example prompts (prefill-only:
// clicking injects into the composer, never auto-sends, so the user edits first).
// A pool we ROTATE (shuffle + pick a few per empty state) so the surface stays
// fresh and shows Audric's breadth — deep research, analysis, creation, image,
// live web, and (signed-in) the wallet — rather than three generic verbs.
//
// `base` = anon-safe (chat / research / create). `authed` = wallet/money, only
// shown when signed in (anon would just hit the sign-in wall).
export const suggestionPool = {
  base: [
    "Research the AI code assistant market and recommend a positioning",
    "Compare the top open-source vector databases for RAG, with sources",
    "Explain zero-knowledge proofs like I'm 12",
    "What happened in AI this week?",
    "Draft a launch tweet for a privacy-first AI app",
    "Generate a logo for a coffee roaster",
    "Compare the leading open LLMs right now",
    "Summarize the latest on Sui",
  ],
  authed: ["What's my Passport balance?", "Send 5 USDC to a friend"],
} as const;

/** Shuffle a pool and take `n` — used to rotate the empty-state chips. */
export function pickSuggestions(authed: boolean, n = 4): string[] {
  const pool = authed
    ? [...suggestionPool.base, ...suggestionPool.authed]
    : [...suggestionPool.base];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
