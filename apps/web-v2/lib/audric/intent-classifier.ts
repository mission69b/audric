/**
 * Heuristic intent classifier + tool selector for `prepareStep.activeTools`.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 *
 * ## What this does
 *
 * Given the latest USER text message in a turn, classify the user's
 * intent against a small set of categories (`send`, `services`, `exit`,
 * plus a `general` fallback) and return the narrowed subset of engine
 * tools the LLM needs for that intent. The result is fed into AI SDK's
 * `prepareStep.activeTools` so the model only sees the tool definitions
 * it needs per step.
 *
 * [SPEC_AUDRIC_DEFI_REMOVAL §2e — 2026-06-10] Intent collapse: the 9
 * finance intents (`save` / `borrow` / `swap` / `rewards` / `rates` /
 * `portfolio` / `history` / `paymentLinks` + general) collapsed with
 * the DeFi removal. `exit` is a TRANSITIONAL intent covering the §2d
 * 7-day grace window (withdraw / repay / swap-to-USDC) — delete it,
 * its keywords, and its tool row at the post-window cut.
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

export type Intent = "exit" | "general" | "send" | "services";

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
  // [SPEC_AUDRIC_DEFI_REMOVAL §2d — transitional] Grace-window exit
  // verbs: unwind NAVI positions + consolidate long-tail tokens to
  // USDC. Delete this row (and its TOOLS_BY_INTENT entry) at the
  // post-window cut.
  exit: [
    /\bwithdraw\b/i,
    /\bwithdrawal\b/i,
    /\brepay\b/i,
    /\bpay\s+back\b/i,
    /\bpay\s+off\b/i,
    /\bdebt\b/i,
    /\bowe\b/i,
    /\bowed\b/i,
    /\bsavings?\b/i,
    /\bdeposit(?:s|ed)?\b/i,
    /\bnavi\b/i,
    /\bswap\b/i,
    /\bconvert\b/i,
    /\bconsolidate\b/i,
    /\bexchange\b/i,
  ],
  // Send: explicitly excludes "pay back" / "pay off" (those are exit/repay).
  // The `pay` keyword is intentionally narrow — only matches when followed
  // by something send-shaped (a recipient indicator or an amount).
  send: [
    /\bsend\b/i,
    /\btransfer\b/i,
    /\bpay\s+(?!back|off)/i,
    /\bgive\b/i,
    /\bto\s+0x[a-f0-9]/i,
    /\bto\s+@/,
    // SuiNS name-resolution cues (resolve_suins lives in `send`'s tool
    // row — recipients are the consumer use case post-DeFi-removal).
    /\bresolve\b/i,
    /\bsuins\b/i,
    /\.sui\b/i,
    /\bwhat('?s| is)\s+the\s+address\b/i,
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
  // [SPEC_AUDRIC_DEFI_REMOVAL §2d — transitional] Grace-window exit
  // surface. `balance_check` reports NAVI savings/debt alongside wallet
  // holdings, so it's the orientation read for "what do I still need to
  // unwind?". Delete this row at the post-window cut.
  exit: [
    "balance_check",
    "withdraw",
    "repay_debt",
    "swap_quote",
    "swap_execute",
    // NAVI MCP token search — resolves long-tail coin types so exotic
    // holdings can exit to USDC (the swap tools' ASSET_NOT_SUPPORTED
    // recovery path). Registered at the chat route; filtered out when
    // the MCP connection is down.
    "navi_navi_search_tokens",
  ],
  // General fallback includes the surviving writes degrade-open: a
  // misclassified turn must never strip a tool the model needs (the
  // pre-collapse production smoke: "I don't have a save_deposit tool").
  // All writes are confirm-tier (user taps), so exposing them on
  // ambiguous turns is safe.
  general: [
    // Reads
    "balance_check",
    "transaction_history",
    "resolve_suins",
    // Writes (degrade-open)
    "send_transfer",
    // [Channel A] MPP Services are the headline capability — keep both
    // the discover (read) + call (pay) tools degrade-open in the fallback
    // so an unanticipated phrasing ("can you make me a logo?") never hits
    // "I don't have that tool".
    "mpp_services",
    "mpp_call",
    // §2d grace window (cut post-window):
    "withdraw",
    "repay_debt",
    "swap_quote",
    "swap_execute",
    "navi_navi_search_tokens",
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
};

/**
 * Tools always exposed to the model regardless of classified intent.
 *
 * Empty since the §2e render-surface collapse (`render_canvas` was the
 * sole entry; the canvas subsystem is deleted). Hosts wire additional
 * always-on tools at the call site (e.g., the gateway-managed
 * `perplexity_search` when `useGateway === true`) by passing them
 * through `alwaysInclude` on the prepare-step factory.
 */
export const ALWAYS_ON_TOOLS: readonly string[] = [];

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
