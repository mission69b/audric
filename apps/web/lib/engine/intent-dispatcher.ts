/**
 * Intent dispatcher — deterministic read-tool pre-dispatch.
 *
 * [v0.46.7] After the v0.46.6 prompt-rule push to "always re-call read tools
 * on direct read questions", baseline testing showed the model still skipped
 * tool calls in ~30% of those cases (e.g. "What's my net worth?" answering
 * from earlier-turn balance_check data without a fresh card). The model's
 * own efficiency heuristic ("data is fresh enough") overrides prompt rules,
 * and no amount of "you MUST re-call" wording changes that — it's a
 * probability cliff, not a deterministic guarantee.
 *
 * This module solves the problem at the architectural layer instead of the
 * prompt layer:
 *
 *   1. Pattern-match the user message against READ_INTENTS (high-precision
 *      regex set, kept narrow to avoid false positives that would dispatch
 *      tools the user didn't ask for).
 *   2. For each match, the chat route deterministically calls the
 *      corresponding read tool via `engine.invokeReadTool()` BEFORE the LLM
 *      runs, streams synthetic `tool_start` + `tool_result` SSE events so
 *      the card renders, and injects matching `tool_use` + `tool_result`
 *      ContentBlocks into the engine message ledger so the LLM sees the
 *      fresh data and narrates around it without re-calling.
 *
 * Properties:
 *   - 0% miss rate on matched patterns (it's code, not probability)
 *   - High precision: only patterns that map UNAMBIGUOUSLY to one tool
 *     should be added here. When in doubt, leave it to the LLM.
 *   - Idempotent: classifying the same message twice returns the same set
 *   - Order-stable: intents are returned in registration order so the UI
 *     always sees cards in the same sequence for a given prompt
 */

export interface ReadIntent {
  /** Tool name registered with the engine (e.g. 'balance_check'). */
  toolName: string;
  /** Arguments to pass to the tool. Most read tools take no args. */
  args: Record<string, unknown>;
  /** Human-readable label used in logs / metrics. */
  label: string;
}

interface IntentRule {
  toolName: string;
  args: Record<string, unknown>;
  label: string;
  /**
   * Pattern must match a meaningful slice of the user's message.
   * Use anchors generously to avoid false positives — e.g. "balance" in
   * "balance the books" should NOT trigger balance_check.
   */
  pattern: RegExp;
}

/**
 * Order matters: when a message matches multiple rules (rare but possible
 * for compound questions like "what's my balance and health factor?"), all
 * matching tools dispatch in this order so cards render top-to-bottom in a
 * predictable sequence.
 *
 * Patterns are intentionally narrow. False positives (dispatching a tool
 * the user didn't actually ask about) waste an RPC call and clutter the
 * UI with an irrelevant card; missed positives (no dispatch when one
 * was warranted) just fall back to the existing LLM-driven flow which
 * still works most of the time. The cost asymmetry favors precision.
 */
const READ_INTENT_RULES: readonly IntentRule[] = [
  // ────────────────────────── balance_check ──────────────────────────
  {
    toolName: 'balance_check',
    args: {},
    label: 'balance/net-worth direct read',
    // Matches: "what's my net worth", "my net worth?", "net worth?",
    // "what's my balance", "what is my balance", "my balance", "show my balance",
    // "what do I have", "how much do I have", "my wallet", "my holdings",
    // "what's in my wallet", "total balance", "what's my total".
    // Does NOT match: "balance the books", "find a healthy balance",
    // "rebalance my portfolio", "your balance" (third person).
    pattern:
      /\b(?:net\s*worth|(?:what(?:'s|\s+is)?\s+(?:my|the)\s+(?:total\s+)?(?:balance|wallet|holdings|net\s*worth))|(?:my\s+(?:balance|wallet|holdings|net\s*worth))|(?:show\s+(?:me\s+)?my\s+(?:balance|wallet|holdings))|(?:how\s+much\s+(?:do\s+i\s+have|am\s+i\s+holding|is\s+in\s+my\s+wallet))|(?:what(?:'s|\s+is)?\s+in\s+my\s+wallet))\b/i,
  },

  // ────────────────────────── health_check ───────────────────────────
  {
    toolName: 'health_check',
    args: {},
    label: 'health/liquidation direct read',
    // Matches: "health factor", "what's my health factor", "my health factor",
    // "am I at risk of liquidation", "risk of liquidation", "liquidation risk",
    // "am I safe", "is my account safe", "borrow capacity", "borrowing capacity",
    // "can I borrow more", "how much can I borrow", "max borrow",
    // "full health check", "health check on my account",
    // "run a health check", "check my account health".
    // Does NOT match: "the health of the protocol", "health of the market"
    // (no "my" / "I" / "account").
    pattern:
      /\b(?:health\s*factor|liquidation(?:\s+risk)?|risk\s+of\s+liquidation|am\s+i\s+(?:safe|at\s+risk)|is\s+my\s+account\s+safe|borrow(?:ing)?\s+capacity|can\s+i\s+borrow(?:\s+more)?|how\s+much\s+can\s+i\s+borrow|max(?:imum)?\s+borrow|(?:full\s+)?health\s+check(?:\s+on\s+my\s+account)?|check\s+my\s+(?:account\s+)?health|run\s+a\s+health\s+check)\b/i,
  },

  // ────────────────────────── mpp_services ───────────────────────────
  {
    toolName: 'mpp_services',
    args: {},
    label: 'mpp services catalog',
    // Matches: "show me available MPP services", "available MPP services",
    // "show me all MPP services", "MPP services", "list MPP services",
    // "what MPP services exist", "what services are available",
    // "show me the service catalog", "service catalog".
    // Does NOT match: "use the translate service" (specific service request),
    // "create a service" (write intent).
    pattern:
      /\b(?:(?:show\s+(?:me\s+)?(?:all\s+)?(?:available\s+)?(?:mpp\s+)?services?(?:\s+(?:on\s+sui|catalog))?)|(?:list\s+(?:all\s+)?(?:available\s+)?(?:mpp\s+)?services?)|(?:available\s+(?:mpp\s+)?services?)|(?:what\s+(?:mpp\s+)?services?\s+(?:are\s+available|exist|do\s+(?:you|we)\s+have))|(?:mpp\s+services?)|(?:service\s+catalog))\b/i,
  },
];

export function classifyReadIntents(message: string): ReadIntent[] {
  if (!message || typeof message !== 'string') return [];

  const trimmed = message.trim();
  if (trimmed.length === 0) return [];

  const matches: ReadIntent[] = [];
  const seenTools = new Set<string>();

  for (const rule of READ_INTENT_RULES) {
    if (seenTools.has(rule.toolName)) continue;
    if (rule.pattern.test(trimmed)) {
      matches.push({
        toolName: rule.toolName,
        args: { ...rule.args },
        label: rule.label,
      });
      seenTools.add(rule.toolName);
    }
  }

  return matches;
}

/**
 * Generate a stable synthetic call ID for an injected tool dispatch. Stable
 * means: deterministic given (turnIndex, toolName) so retrying the same turn
 * doesn't generate a different ID. The `auto_` prefix is what `harness-metrics`
 * keys off when reporting which tools were pre-dispatched vs. LLM-called.
 */
export function makeAutoDispatchId(turnIndex: number, toolName: string): string {
  return `auto_${turnIndex}_${toolName}`;
}

export const __testOnly__ = { READ_INTENT_RULES };
