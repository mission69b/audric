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
 *
 * [v0.46.9] Expanded coverage to include long-tail "direct read" questions
 * that baseline E-H surfaced as missed-card cases:
 *   - transaction_history (last tx, today, yesterday)
 *   - activity_summary (services-spend)
 *   - yield_summary (yield questions)
 *
 * Rule registry now supports per-rule arg builders (so multi-rule per tool
 * with different args is possible — e.g. transaction_history fires with
 * `{ limit: 1 }` for "my last transaction" and `{ date: '2026-04-19' }`
 * for "what did I do today"). Dedup key is `toolName + JSON(args)` so a
 * single message can produce multiple distinct intents that map to the same
 * tool with different inputs (rare but supported).
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
  /**
   * Static args. Used when `argsBuilder` is omitted. Most rules use this.
   */
  args?: Record<string, unknown>;
  /**
   * Computed args. Takes precedence over `args` when present. Used for
   * rules that need a value derived at classification time (e.g. today's
   * date in YYYY-MM-DD for `transaction_history`). Receives the regex
   * match for context but most builders ignore it.
   */
  argsBuilder?: (match: RegExpMatchArray) => Record<string, unknown>;
  label: string;
  /**
   * Pattern must match a meaningful slice of the user's message.
   * Use anchors generously to avoid false positives — e.g. "balance" in
   * "balance the books" should NOT trigger balance_check.
   */
  pattern: RegExp;
  /**
   * [Bug 1 / 2026-04-28] When true, skip this rule if the message looks
   * like a third-party ask ("balance of funkii", "alice's balance",
   * "what's the balance of 0x40cd…"). This prevents the dispatcher from
   * pre-firing a SELF balance_check on top of the LLM's correctly-targeted
   * third-party balance_check, which produced two cards in chat.
   *
   * Only applies to rules whose static `args` would default to the
   * signed-in wallet. Rules that explicitly target an address (or that
   * always run regardless of subject) leave this off.
   */
  skipIfThirdParty?: boolean;
}

/**
 * Detects whether the user's message is asking about someone else's
 * balance/portfolio/wallet/account, rather than their own.
 *
 * Two patterns trigger third-party intent:
 *   1. Possessive + noun: `<name>'s balance` (e.g. "funkii's balance",
 *      "alice's portfolio"). Excludes `my balance` / `your balance`
 *      because those are pronouns, not third-party names.
 *   2. Noun + of/for + non-self target: `balance of <X>` /
 *      `portfolio for <X>` where `<X>` is anything other than
 *      `me|mine|myself|my`.
 *
 * A literal hex Sui address (`0x...`) in the message also counts as
 * third-party — even without a possessive — because the user has
 * explicitly named a target wallet.
 *
 * False positives are tolerable here (we just defer to the LLM, which
 * usually handles it correctly via prompt rules + guardAddressScope).
 * False negatives are NOT — they cause the duplicate-card bug we're
 * fixing.
 */
const FINANCIAL_NOUN_GROUP =
  '(?:balance|account|portfolio|wallet|holdings|assets|tokens|coins|net\\s*worth|health(?:\\s*factor)?|yield|earnings|positions?)';

function isThirdPartyAsk(message: string): boolean {
  const SELF_TARGETS = new Set(['me', 'mine', 'myself', 'my']);

  // Pattern 1: <name>'s <noun>. \w+ catches names but also "my" / "your" —
  // we filter those out by hand because Unicode \b makes the lookbehind
  // version too brittle across runtimes.
  const possessiveMatch = message.match(
    new RegExp(`\\b(\\w+)['\u2019]s\\s+${FINANCIAL_NOUN_GROUP}\\b`, 'i'),
  );
  if (possessiveMatch) {
    const owner = possessiveMatch[1].toLowerCase();
    if (owner !== 'my' && owner !== 'your' && owner !== 'our') return true;
  }

  // Pattern 2: <noun> (of|for) <target>, where target isn't a self-pronoun.
  const ofForMatch = message.match(
    new RegExp(`\\b${FINANCIAL_NOUN_GROUP}\\s+(?:of|for)\\s+([\\w'\u2019.@-]+)`, 'i'),
  );
  if (ofForMatch) {
    const target = ofForMatch[1].toLowerCase().replace(/[.,?!'"]+$/g, '');
    if (!SELF_TARGETS.has(target)) return true;
  }

  // Pattern 3: explicit hex Sui address present (60-64 hex chars).
  if (/0x[a-fA-F0-9]{60,64}/.test(message)) return true;

  return false;
}

/**
 * Detects whether the user's message ALSO contains a self-balance ask in
 * addition to (or instead of) any third-party reference. We use this to
 * keep `skipIfThirdParty` from over-suppressing compound queries like
 * "what's my balance and funkii's balance" — those should still fire the
 * SELF balance card so the user sees both wallets, not just the contact's.
 *
 * Patterns considered self:
 *   - `my <financial_noun>` (e.g. "my balance", "my net worth").
 *   - `<financial_noun> (of|for) (me|mine|myself|my)`.
 *
 * Note: this is intentionally narrow (financial nouns only). A vague "I"
 * elsewhere in the sentence isn't enough — the user has to actually be
 * asking about a balance/portfolio/etc. of their own.
 */
function hasSelfBalanceAsk(message: string): boolean {
  if (new RegExp(`\\bmy\\s+${FINANCIAL_NOUN_GROUP}\\b`, 'i').test(message)) {
    return true;
  }
  const ofForMe = message.match(
    new RegExp(`\\b${FINANCIAL_NOUN_GROUP}\\s+(?:of|for)\\s+(me|mine|myself|my)\\b`, 'i'),
  );
  if (ofForMe) return true;
  return false;
}

/**
 * Returns YYYY-MM-DD relative to today (server time). `0` = today,
 * `-1` = yesterday. Used by the date-driven `transaction_history` rules.
 *
 * NOTE: server time vs user time. Audric runs the dispatcher on the
 * Next.js server, so "today" is whatever the server thinks. For users in
 * very different timezones this can be off by one day at edges — that's
 * accepted as "good enough" since the existing transaction_history `date`
 * filter has the same property and we don't currently track user TZ at
 * the request layer. Worth revisiting when we do.
 */
function isoDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
    // [Bug 1a / 2026-04-27] Extended to match plural-noun phrasings the user
    // hit in production: "what are my assets", "my assets", "list my tokens".
    // Pre-fix the verb form `\s+are` was missing and the noun set excluded
    // `assets|tokens|coins`, so "what are my assets" fell through to the
    // LLM, which answered from cached <financial_context> and dropped USDsui.
    //
    // Matches: "what's my net worth", "my net worth?", "net worth?",
    // "what's my balance", "what is my balance", "my balance", "show my balance",
    // "what do I have", "how much do I have", "my wallet", "my holdings",
    // "what's in my wallet", "total balance", "what's my total",
    // "what are my assets", "my assets", "my tokens", "my coins",
    // "list my assets", "show me my tokens", "what are my holdings".
    // Does NOT match: "balance the books", "find a healthy balance",
    // "rebalance my portfolio", "your balance" (third person),
    // "show my portfolio" (handled by portfolio_analysis, not balance_check).
    //
    // [Bug 1 / 2026-04-28] Also gated by `skipIfThirdParty` so phrasings
    // like "what's the balance of funkii's account?" or "alice's net
    // worth" no longer pre-fire a SELF balance_check on top of the
    // LLM's correct third-party balance_check (which produced two
    // overlapping cards in chat).
    pattern:
      /\b(?:net\s*worth|(?:what(?:'s|\s+is|\s+are)?\s+(?:my|the)\s+(?:total\s+)?(?:balance|wallet|holdings|net\s*worth|assets|tokens|coins))|(?:my\s+(?:balance|wallet|holdings|net\s*worth|assets|tokens|coins))|(?:(?:show|list)\s+(?:me\s+)?(?:all\s+)?my\s+(?:balance|wallet|holdings|assets|tokens|coins))|(?:how\s+much\s+(?:do\s+i\s+have|am\s+i\s+holding|is\s+in\s+my\s+wallet))|(?:what(?:'s|\s+is)?\s+in\s+my\s+wallet))\b/i,
    skipIfThirdParty: true,
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
    //
    // [Bug 1 / 2026-04-28] Gated by `skipIfThirdParty` for the same reason
    // as balance_check: "what's funkii's health factor" should not fire a
    // SELF health_check.
    pattern:
      /\b(?:health\s*factor|liquidation(?:\s+risk)?|risk\s+of\s+liquidation|am\s+i\s+(?:safe|at\s+risk)|is\s+my\s+account\s+safe|borrow(?:ing)?\s+capacity|can\s+i\s+borrow(?:\s+more)?|how\s+much\s+can\s+i\s+borrow|max(?:imum)?\s+borrow|(?:full\s+)?health\s+check(?:\s+on\s+my\s+account)?|check\s+my\s+(?:account\s+)?health|run\s+a\s+health\s+check)\b/i,
    skipIfThirdParty: true,
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

  // ─────────────── transaction_history — last single tx ──────────────
  {
    toolName: 'transaction_history',
    args: { limit: 1 },
    label: 'last transaction direct read',
    // Matches: "what was my last transaction", "what's my last transaction",
    // "show my last transaction", "my last transaction", "last tx".
    // Singular only — uses \b after "transaction" which fails before the
    // plural 's' (both word chars), so "my last 5 transactions" is left
    // for the LLM to handle (and the existing limit-aware path renders fine).
    // Does NOT match: "my last transactions", "my last 5 transactions",
    // "last week's transaction" (no "my").
    pattern:
      /\b(?:what\s+(?:was|is)\s+|show\s+(?:me\s+)?)?my\s+last\s+(?:transaction|tx)\b(?!s)/i,
  },

  // ─────────────── transaction_history — today's activity ────────────
  {
    toolName: 'transaction_history',
    argsBuilder: () => ({ date: isoDateOffset(0) }),
    label: "today's activity direct read",
    // Matches: "show today's activity", "today's transactions", "what did I
    // do today", "show me today's transactions".
    // Does NOT match: "show me activity for today's market" (no possessive
    // attached to today + activity/tx structure).
    pattern:
      /\b(?:show\s+(?:me\s+)?)?today(?:['’]?s)?\s+(?:activity|transactions?|tx)\b|\bwhat\s+did\s+i\s+do\s+today\b/i,
  },

  // ─────────────── transaction_history — yesterday's activity ────────
  {
    toolName: 'transaction_history',
    argsBuilder: () => ({ date: isoDateOffset(-1) }),
    label: "yesterday's activity direct read",
    // Matches: "what did I do yesterday", "yesterday's activity",
    // "yesterday's transactions", "show me yesterday's activity".
    // Does NOT match: "what happened to BTC yesterday" (no "I" pronoun
    // and no explicit activity/tx noun).
    pattern:
      /\b(?:show\s+(?:me\s+)?)?yesterday(?:['’]?s)?\s+(?:activity|transactions?|tx)\b|\bwhat\s+(?:did\s+i\s+do|happened)\s+yesterday\b/i,
  },

  // ─────────────────── activity_summary — services spend ─────────────
  {
    toolName: 'activity_summary',
    args: { period: 'month' },
    label: 'services spend direct read',
    // Matches: "what did I spend on services this month", "what have I
    // spent on services", "how much did I spend on APIs", "what did I pay
    // for services", "what did I spend on MPP".
    // Does NOT match: "spend $5 on a service" (write intent), "spending
    // breakdown" (handled by canvas tool).
    pattern:
      /\b(?:what|how\s+much)\s+(?:did|have)\s+i\s+(?:spen[dt]|paid?|use[ds]?)\b.*\b(?:services?|apis?|mpp|gateway|tools?)\b/i,
  },

  // ─────────────────── yield_summary — yield direct read ─────────────
  {
    toolName: 'yield_summary',
    args: {},
    label: 'yield earnings direct read',
    // Matches: "show my yield", "what's my yield", "what's my yield this
    // month", "show my yield earnings", "how much have I earned",
    // "how much am I earning", "my earnings", "my yield earnings",
    // "what is my yield".
    // Does NOT match: "yield farming strategies" (no "my"/"I"),
    // "show me yields on Sui" (asks about market yields, not user's),
    // "high yield pools" (market query).
    pattern:
      /\b(?:what(?:'s|\s+is)?\s+)?my\s+(?:current\s+|monthly\s+)?yield(?:\s+earnings?|\s+this\s+(?:week|month|year))?\b|\bshow\s+(?:me\s+)?my\s+yield(?:\s+earnings?)?\b|\bhow\s+much\s+(?:have\s+i\s+earned|am\s+i\s+earning|do\s+i\s+earn)\b|\bmy\s+earnings\b/i,
  },
];

/**
 * Stable JSON fingerprint of args. Used for both dedup-key and the
 * makeAutoDispatchId discriminator so two rules that target the same tool
 * with different args don't collide.
 *
 * [v1.4 — Item 2 / G12] Promoted from `__testOnly__` to a public export so
 * `chat/route.ts` can reuse the same canonical key formula when deduping
 * resumed-session pre-fetch intents against classifier output. Two diverging
 * fingerprint implementations would silently drift and resurrect the
 * "Returning user 2 → 0 tool calls" baseline regression.
 */
export function argsFingerprint(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  if (keys.length === 0) return '';
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = args[k];
  return JSON.stringify(sorted);
}

export function classifyReadIntents(message: string): ReadIntent[] {
  if (!message || typeof message !== 'string') return [];

  const trimmed = message.trim();
  if (trimmed.length === 0) return [];

  const matches: ReadIntent[] = [];
  // Dedup by (toolName + argsFingerprint) so the same tool can fire with
  // different args from different rules in one message, but identical
  // (toolName, args) pairs only fire once.
  const seenKeys = new Set<string>();

  // Compute once per call so per-rule checks are O(1).
  const thirdParty = isThirdPartyAsk(trimmed);
  const selfAsk = hasSelfBalanceAsk(trimmed);
  // Compound queries that mention BOTH a third party AND the user's own
  // wallet ("what's my balance and funkii's balance") must keep the SELF
  // pre-dispatch — otherwise the LLM only renders the contact's card and
  // the user's own balance is reduced to a caption sentence. We only
  // suppress the self-targeting rule when the message is *purely*
  // third-party.
  const suppressSelfRules = thirdParty && !selfAsk;

  for (const rule of READ_INTENT_RULES) {
    if (rule.skipIfThirdParty && suppressSelfRules) continue;
    const m = trimmed.match(rule.pattern);
    if (!m) continue;
    const args = rule.argsBuilder ? rule.argsBuilder(m) : { ...(rule.args ?? {}) };
    const dedupKey = `${rule.toolName}:${argsFingerprint(args)}`;
    if (seenKeys.has(dedupKey)) continue;
    matches.push({
      toolName: rule.toolName,
      args,
      label: rule.label,
    });
    seenKeys.add(dedupKey);
  }

  return matches;
}

/**
 * Generate a stable synthetic call ID for an injected tool dispatch. Stable
 * means: deterministic given (turnIndex, toolName, discriminator) so retrying
 * the same turn doesn't generate a different ID. The `auto_` prefix is what
 * `harness-metrics` keys off when reporting which tools were pre-dispatched
 * vs. LLM-called.
 *
 * `discriminator` (optional) lets the caller distinguish multiple intents
 * that target the same tool with different args in one turn (e.g. if a
 * single message matched both "yesterday's activity" and "today's activity"
 * for transaction_history). Backward-compatible: omitting it preserves the
 * v0.46.7 behavior where each turn had at most one dispatch per tool.
 */
export function makeAutoDispatchId(
  turnIndex: number,
  toolName: string,
  discriminator?: string,
): string {
  const suffix = discriminator ? `_${discriminator}` : '';
  return `auto_${turnIndex}_${toolName}${suffix}`;
}

/**
 * Compute a short, URL-safe discriminator suitable for embedding in a
 * tool call ID. Used by chat-route to disambiguate same-tool/different-args
 * dispatches. Returns empty string for no-arg intents (preserves the
 * unsuffixed ID format for the simple case).
 */
export function intentDiscriminator(intent: ReadIntent): string {
  const fp = argsFingerprint(intent.args);
  if (!fp) return '';
  // Hash the JSON to a short alphanumeric token. Cheap FNV-1a 32-bit;
  // collisions across distinct args within one turn are vanishingly rare
  // for the rule set we register.
  let h = 0x811c9dc5;
  for (let i = 0; i < fp.length; i++) {
    h ^= fp.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const __testOnly__ = {
  READ_INTENT_RULES,
  isoDateOffset,
  isThirdPartyAsk,
  hasSelfBalanceAsk,
};
