/**
 * Heuristic intent classifier + tool selector for `prepareStep.activeTools`.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 *
 * ## What this does
 *
 * Given the latest USER text message in a turn, classify the user's
 * intent against a fixed set of finance categories (`save`, `borrow`,
 * `send`, `swap`, `rewards`, `history`, `portfolio`, `paymentLinks`,
 * `rates`, plus a `general` fallback) and return the narrowed subset of
 * engine tools the LLM needs for that intent. The result is fed into
 * AI SDK's `prepareStep.activeTools` so the model only sees ~5-8 tool
 * definitions per step instead of the full 26 the engine registers.
 *
 * ## Why heuristic v1
 *
 * Two alternatives considered + rejected:
 *
 *   1. **LLM-based classifier** — one `generateText({output: Output.object})`
 *      call per turn to classify intent. Adds 200-400ms latency to every
 *      first step + extra LLM cost. Defer to v2 only if heuristic accuracy
 *      is bad enough to matter (smoke-driven, not pre-emptive).
 *
 *   2. **Embedding-similarity classifier** — embed the user message,
 *      cosine-similarity against intent prototype embeddings. Higher
 *      accuracy than keywords but requires an embedding model dependency
 *      + 50-100ms cold-start. Same defer-to-v2 logic.
 *
 * Keyword regex matching is:
 *   - Deterministic (testable, reproducible)
 *   - Sub-millisecond (no I/O)
 *   - Easy to extend (add a pattern, no model retraining)
 *
 * Accuracy budget: ~85-90% on typical finance phrasings. The 10-15% miss
 * rate falls into the `general` fallback (now widened in the 2026-05-24
 * hotfix to include the 6 most common writes alongside read tools) so
 * misclassifications degrade to "slightly bloated activeTools" not
 * "tool not available." Conservative-by-construction.
 *
 * The `general` widening is paired with conversational carryover in
 * `active-tools-prepare-step.ts` — together they handle the two failure
 * modes the production smoke exposed:
 *
 *   1. Typo'd keywords ("yeild" → /yield/i miss) on follow-up turns
 *      → carryover inherits the previous turn's intent
 *   2. Genuinely ambiguous queries that match no intent ("what should
 *      i do with my crypto") → widened general fallback still gives
 *      the LLM access to common writes so it doesn't hallucinate
 *      that `save_deposit` etc. don't exist
 *
 * ## Output shape
 *
 * `classifyIntent` returns `{ intents: Intent[], confidence: ... }`. When
 * multiple intents match (e.g., "swap and save my USDC" → swap + save),
 * the tool selector takes the UNION. The cap is a natural one — each
 * intent's tool subset is a subset of the engine's 26-tool registry, so
 * the union is at most 26 (typically 7-12 even for ambiguous inputs).
 *
 * ## What's NOT classified
 *
 *   - Tool-result-only resume turns (latest message has no user text)
 *     → caller is responsible for caching the previous turn's intent
 *     (see `active-tools-prepare-step.ts`).
 *   - System messages — filtered upstream by the route's message
 *     normalization pipeline.
 *   - Empty / whitespace-only text → `general` fallback (safe default).
 *
 * ## SSOT
 *
 * Engine tool roster: `packages/engine/src/tools/index.ts`
 * `READ_TOOLS` + `WRITE_TOOLS` (26 tools total post-S.277 "Earns Its
 * Keep" audit). When the engine adds or removes a tool, update the
 * `TOOLS_BY_INTENT` map below in the same diff. Tool names that don't
 * exist in the agent's runtime tool set are filtered out by
 * `active-tools-prepare-step.ts` — safe by construction, but stale
 * entries here will go undetected at type-check time.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Intent =
  | "borrow"
  | "general"
  | "history"
  | "paymentLinks"
  | "portfolio"
  | "rates"
  | "rewards"
  | "save"
  | "send"
  | "services"
  | "swap";

export interface IntentResult {
  /**
   * Confidence in the classification. `high` = single intent matched,
   * `medium` = multiple intents matched (still useful, just broader),
   * `low` = no keyword match → `general` fallback.
   */
  confidence: "high" | "low" | "medium";
  /**
   * Matched intents, in declaration order. Always non-empty — `general`
   * fallback fires when no keyword regex matches. Caller should UNION
   * the tool subsets across all matched intents.
   */
  intents: Intent[];
}

// ---------------------------------------------------------------------------
// Keyword → intent mapping
// ---------------------------------------------------------------------------
//
// One regex per phrasing variant. `\b` word boundaries keep "save" from
// matching "behaviour" or "lifesaver"; case-insensitive flag covers
// "SAVE" / "Save" / "save". No global flag (we use `.test()` which
// would otherwise mutate `lastIndex` across calls).
//
// Order of declaration doesn't affect classification (we test ALL
// patterns for ALL intents and take the union of matches), but
// alphabetized for skim-readability.
// ---------------------------------------------------------------------------

const INTENT_KEYWORDS: Record<Exclude<Intent, "general">, RegExp[]> = {
  borrow: [
    /\bborrow\b/i,
    /\bloans?\b/i,
    /\bcredit\b/i,
    /\bleverage\b/i,
    /\brepay\b/i,
    /\bpay\s+back\b/i,
    /\bpay\s+off\b/i,
    /\bdebt\b/i,
    /\bowe\b/i,
    /\bowed\b/i,
    /\bhealth\s+factor\b/i,
    /\bHF\b/,
  ],
  history: [
    /\bhistory\b/i,
    /\btransactions?\b/i,
    /\bactivity\b/i,
    /\bwhat\s+(did|happened)\b/i,
    /\bexplain\b/i,
    /\bspending\b/i,
    /\bspent\b/i,
    /\bshow\s+me\s+my\s+(past|recent)\b/i,
  ],
  paymentLinks: [
    /\bpayment\s+links?\b/i,
    /\binvoices?\b/i,
    /\bQR\s+code\b/i,
    /\breceive\b/i,
    // Matches "request 25 USDC from alice", "request payment", etc.
    // The lookahead anchors `request` to a finance noun within ~30
    // chars so "request a refund" or "request help" stay in `general`.
    /\brequest\b.{0,30}\b(?:USDC|USDsui|payment|money|coin)\b/i,
    /\bgenerate\s+(?:a\s+)?link\b/i,
  ],
  portfolio: [
    /\bportfolio\b/i,
    /\bnet\s+worth\b/i,
    /\bbalances?\b/i,
    /\bhow\s+much\s+(do\s+i\s+have|am\s+i\s+worth)\b/i,
    /\bworth\b/i,
    /\ball\s+my\b/i,
    /\bholdings?\b/i,
    /\ballocations?\b/i,
    /\bwallet\b/i,
    // [F6 — 2026-05-31] SuiNS name-resolution cues. `portfolio` already
    // carries `resolve_suins` in TOOLS_BY_INTENT, so routing bare
    // "resolve alice.sui" / "what's the address for suins.sui" here
    // hands the model the tool instead of falling to `general` (which
    // omitted it → the agent hallucinated "I don't have resolve_suins").
    /\bresolve\b/i,
    /\bsuins\b/i,
    /\.sui\b/i,
    /\bwhat('?s| is)\s+the\s+address\b/i,
  ],
  rates: [
    /\brates?\b/i,
    /\bAPY\b/,
    /\bAPR\b/,
    /\binterest\b/i,
    /\bbest\s+yields?\b/i,
    /\bcompare\s+(?:rates|yields|APYs?)\b/i,
  ],
  rewards: [/\brewards?\b/i, /\bclaim\b/i, /\bharvest\b/i, /\bcompound\b/i],
  save: [
    /\bsave\b/i,
    /\bsaving\b/i,
    /\bsavings?\b/i,
    /\bdeposit\b/i,
    /\bearn\b/i,
    /\byield\b/i,
    /\bwithdraw\b/i,
    /\bwithdrawal\b/i,
    // Workflow phrases that touch save (rebalance often moves wallet
    // assets into savings; auto-save is a save-shaped workflow).
    /\brebalance\b/i,
    /\bauto[- ]save\b/i,
  ],
  // Send: explicitly excludes "pay back" / "pay off" (those are borrow/repay).
  // The `pay` keyword is intentionally narrow — only matches when followed
  // by something send-shaped (a recipient indicator or an amount).
  send: [
    /\bsend\b/i,
    /\btransfer\b/i,
    /\bpay\s+(?!back|off)/i,
    /\bgive\b/i,
    /\bto\s+0x[a-f0-9]/i,
    /\bto\s+@/,
  ],
  // Services: paid third-party APIs callable via MPP (image gen,
  // transcription, TTS/voice, paid search, etc.). The headline Channel A
  // capability — keep the cues broad; misses degrade to `general` which
  // also carries the MPP tools (conservative-by-construction).
  services: [
    /\bgenerate\s+(?:an?\s+|some\s+)?(image|picture|logo|art|artwork|photo|avatar|audio|voice|speech|song|music)\b/i,
    /\b(make|create|draw)\s+(?:me\s+)?(?:an?\s+|some\s+)?(image|picture|logo|artwork|avatar)\b/i,
    /\b(image|picture|logo|art)\s+(gen|generation|generator)\b/i,
    /\btranscribe\b/i,
    /\btranscription\b/i,
    /\btext[- ]to[- ]speech\b/i,
    /\bTTS\b/,
    /\bvoice\s*over\b/i,
    /\bnarrate\b/i,
    /\bdall[- ]?e\b/i,
    /\bmidjourney\b/i,
    /\beleven\s*labs\b/i,
    /\bpaid\s+(?:api|service)\b/i,
    /\bthird[- ]party\s+(?:api|service)\b/i,
  ],
  swap: [
    /\bswap\b/i,
    /\bconvert\b/i,
    /\btrade\b/i,
    /\bexchange\b/i,
    // Workflow phrases that touch swap (rebalance + diversify both
    // typically involve at least one swap leg).
    /\brebalance\b/i,
    /\bdiversify\b/i,
  ],
};

// ---------------------------------------------------------------------------
// Tool selection per intent
// ---------------------------------------------------------------------------
//
// The 5-8 tools each intent actually needs. Read tools first (the LLM
// typically queries state before acting), then write tools that match
// the intent.
//
// Three design rules:
//
//   1. Each intent INCLUDES the post-write refresh read tools relevant
//      to its writes. Save touches savings + balance → save's set
//      includes `balance_check` and `savings_info`. Borrow touches HF
//      → borrow's set includes `health_check`. This way the LLM can
//      verify state after a write WITHOUT the route having to widen
//      activeTools for follow-up steps.
//
//   2. Identity-resolution tools (`resolve_suins`) live with their
//      consumers — `send` (to look up recipient handles) and `portfolio`
//      (to handle "what's @alice's portfolio?" queries).
//
//   3. `render_canvas` is universally available via `ALWAYS_ON_TOOLS`
//      below — every intent might benefit from rich visualization.
//
// When the engine adds/removes a tool: update the relevant intent set
// in the SAME diff so this map stays in sync with the engine roster.
// ---------------------------------------------------------------------------

const TOOLS_BY_INTENT: Record<Intent, readonly string[]> = {
  borrow: [
    "balance_check",
    "savings_info",
    "health_check",
    "rates_info",
    "borrow",
    "repay_debt",
  ],
  // [HOTFIX 2026-05-24] General fallback now includes the 6 most common
  // write tools (save_deposit, withdraw, send_transfer, borrow,
  // repay_debt, swap_execute) alongside the 6 read tools. Pre-hotfix
  // the fallback was reads-only, so misclassifications stripped writes
  // from activeTools and caused the model to hallucinate that tools
  // didn't exist (production smoke: "I don't have a save_deposit tool").
  //
  // Token cost: +~900 tokens of schema on misclassified turns (10-15%
  // of traffic per the accuracy budget). On HIGH-confidence intent turns
  // (the 85-90% case) the narrow per-intent subset is still used —
  // general is the fallback, not the floor.
  //
  // The post-write refresh reads (savings_info, health_check) stay
  // included so the LLM can verify state after any write executes.
  // Niche writes (claim_rewards, harvest_rewards) deliberately omitted:
  // they're rewards-intent-only operations the LLM should never pick
  // without a clear keyword cue.
  general: [
    // Reads
    "balance_check",
    "savings_info",
    "health_check",
    "transaction_history",
    "portfolio_analysis",
    "rates_info",
    // [F6 — 2026-05-31] resolve_suins is degrade-open in the fallback:
    // a cheap, side-effect-free read so a misclassified name-resolution
    // turn still hands the model the tool (pre-fix the agent claimed it
    // didn't exist on bare "resolve X.sui" queries).
    "resolve_suins",
    // Writes (degrade-open per docstring's conservative-by-construction claim)
    "save_deposit",
    "withdraw",
    "send_transfer",
    "borrow",
    "repay_debt",
    "swap_execute",
    // [Channel A] MPP Services are the headline capability — keep both
    // the discover (read) + call (pay) tools degrade-open in the fallback
    // so an unanticipated phrasing ("can you make me a logo?") never hits
    // "I don't have that tool". mpp_call is confirm-tier (user taps), so
    // exposing it on ambiguous turns is safe.
    "mpp_services",
    "mpp_call",
  ],
  history: [
    "transaction_history",
    "explain_tx",
    "activity_summary",
    "spending_analytics",
    "yield_summary",
  ],
  paymentLinks: [
    "balance_check",
    "list_payment_links",
    "create_payment_link",
    "cancel_payment_link",
  ],
  portfolio: [
    "balance_check",
    "savings_info",
    "health_check",
    "portfolio_analysis",
    "token_prices",
    "pending_rewards",
    "resolve_suins",
  ],
  rates: ["rates_info", "savings_info", "token_prices", "portfolio_analysis"],
  rewards: [
    "balance_check",
    "savings_info",
    "pending_rewards",
    "health_check",
    "claim_rewards",
    "harvest_rewards",
  ],
  save: [
    "balance_check",
    "savings_info",
    "rates_info",
    "health_check",
    "save_deposit",
    "withdraw",
  ],
  send: [
    "balance_check",
    "resolve_suins",
    "transaction_history",
    "send_transfer",
  ],
  // Discover (mpp_services) + pay (mpp_call) must be active together so
  // the discover→call flow completes within a single turn (activeTools is
  // cached for the whole turn after step 0). balance_check lets the LLM
  // sanity-check funds before paying.
  services: ["balance_check", "mpp_services", "mpp_call"],
  swap: ["balance_check", "swap_quote", "token_prices", "swap_execute"],
};

/**
 * Tools always exposed to the model regardless of classified intent.
 *
 *   - `render_canvas` is the universal visualization primitive. Any
 *     turn might end with the LLM wanting to chart a result.
 *
 * Hosts wire additional always-on tools at the call site (e.g., the
 * gateway-managed `perplexity_search` when `useGateway === true`) by
 * passing them through `alwaysInclude` on the prepare-step factory.
 */
export const ALWAYS_ON_TOOLS: readonly string[] = ["render_canvas"];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a single user text against the intent regex map.
 *
 * Empty / whitespace-only input → `general` with `low` confidence.
 * Single intent matched → `high` confidence.
 * Multiple intents matched → `medium` confidence (union of tools).
 * No intent matched → `general` fallback with `low` confidence.
 *
 * Pure function — deterministic, no I/O, safe to memoize / cache.
 */
export function classifyIntent(text: string): IntentResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { intents: ["general"], confidence: "low" };
  }

  const matched: Intent[] = [];
  const entries = Object.entries(INTENT_KEYWORDS) as [
    Exclude<Intent, "general">,
    RegExp[],
  ][];
  for (const [intent, patterns] of entries) {
    if (patterns.some((p) => p.test(trimmed))) {
      matched.push(intent);
    }
  }

  if (matched.length === 0) {
    return { intents: ["general"], confidence: "low" };
  }

  return {
    intents: matched,
    confidence: matched.length === 1 ? "high" : "medium",
  };
}

/**
 * Convert an `IntentResult` into the union of tool names the LLM
 * should see for this turn. Includes `ALWAYS_ON_TOOLS` unconditionally.
 *
 * The caller is responsible for filtering the result against the
 * actual tool registry (some entries may not be wired in a particular
 * host configuration — e.g., gateway tools).
 */
export function selectActiveTools(intentResult: IntentResult): string[] {
  const set = new Set<string>(ALWAYS_ON_TOOLS);
  for (const intent of intentResult.intents) {
    for (const tool of TOOLS_BY_INTENT[intent]) {
      set.add(tool);
    }
  }
  return [...set];
}
