/**
 * Intent dispatcher — deterministic read-tool pre-dispatch.
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 6 Prep) ---
 *
 * Per D-14 lock (BENEFITS_SPEC_v07c.md S.173, runbook §Day 2d closure):
 * KEEP the regex dispatcher as-is, port byte-for-byte, same 8 rules.
 * Do NOT migrate to `generateObject` — that's Phase 4.5 (D-16) territory
 * and intent-dispatcher is regex (not an LLM classifier).
 *
 * The dispatcher's purpose is NOT to parallelise tool calls (AI SDK
 * already does that for concurrent calls). It is to **force the LLM
 * to call read tools it would otherwise skip**. v0.46.7 baseline
 * observed a ~30% skip rate on direct read questions ("what's my net
 * worth?") because the LLM lazy-answers from cached `<financial_context>`
 * data instead of calling fresh tools. The dispatcher's deterministic
 * regex match + pre-fire + tool-result injection sidesteps that
 * probability cliff.
 *
 * --- ALTERNATIVES RULED OUT (D-14 / D-16 reconciliation) ---
 *
 * The "all-in on Vercel" question keeps coming up — here's the
 * boundary. v0.7d Phase 4 (BENEFITS_SPEC_v07d.md §E-4 + §D-7) DOES
 * migrate the 8+ existing LLM-call classifiers to `generateObject`.
 * THIS file is different — it's a PRE-LLM regex pre-fire layer whose
 * job is to AVOID an LLM call entirely. The 4 Vercel-native
 * alternatives we considered:
 *
 *   1. `generateObject({ schema })` for intent classification
 *      → REJECTED: adds a SECOND LLM call BEFORE the main
 *        agent.stream() (+300-500ms latency + +cost per turn);
 *        regex is sub-100µs and 0% miss rate on the 8 known patterns.
 *
 *   2. `toolChoice: { type: 'tool', toolName: ... }` (force-call)
 *      → REJECTED: can't decide WHICH tool to force without
 *        classifying intent first → same problem kicked one step
 *        earlier (back to regex or LLM-classifier).
 *
 *   3. `useChat`'s `onToolCall` to pre-fire
 *      → REJECTED: fires AFTER the LLM decides to call a tool,
 *        which is exactly the skip path we're countering.
 *
 *   4. Rely on AI SDK's parallel tool dispatch
 *      → REJECTED: parallelises tools the LLM CHOOSES to call;
 *        orthogonal to the skip problem.
 *
 * v0.7d Phase 4 introduces `generateObject` as a SECONDARY classifier
 * for COMPOUND / UNMATCHED queries the 8 regex rules don't catch (per
 * BENEFITS_SPEC_v07d.md §E-4 line 146 — "+80 LoC ADDED for
 * unmatched-pattern fallback"). The 8 deterministic rules below stay
 * regex; only the fallback path becomes generateObject. That's the
 * full Vercel-native posture: use the primitive where it earns its
 * cost; don't use it where regex is structurally superior.
 *
 * web-v2 today only wires `balance_check` as a read tool (Phase 4
 * scope is the 11 confirm-tier writes). The dispatcher module ports
 * all 8 rules byte-for-byte for forward-compatibility — when later
 * slices wire `health_check`, `transaction_history`, `mpp_services`,
 * `activity_summary`, `yield_summary` as read tools, the dispatcher
 * already works. For the v0.7c slice the chat-route caller gracefully
 * skips any intent whose tool isn't in the registry it passes in.
 *
 * --- PORT NOTES ---
 *
 *   - `READ_INTENT_RULES` ported byte-for-byte from
 *     `audric/apps/web/lib/engine/intent-dispatcher.ts`.
 *   - Helper functions (`isThirdPartyAsk`, `hasSelfBalanceAsk`,
 *     `isoDateOffset`, `argsFingerprint`, `classifyReadIntents`,
 *     `makeAutoDispatchId`, `intentDiscriminator`) ported verbatim.
 *   - Dedup shim from `apps/web/lib/engine/dispatch-intents.ts`
 *     consolidated as `buildDispatchIntents` below.
 *   - Server-side helpers (`dispatchIntentsToParts`,
 *     `synthesizeAssistantToolMessage`, `synthesizeUserToolResultMessage`)
 *     are NEW in web-v2 — they replace the legacy chat route's inline
 *     SSE-event-emission + `engine.loadMessages()` injection with the
 *     equivalent AI SDK v6 UIMessage-parts shape.
 */

import type { Tool, ToolContext } from "@t2000/engine";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReadIntent {
  /** Arguments to pass to the tool. Most read tools take no args. */
  args: Record<string, unknown>;
  /** Human-readable label used in logs / metrics. */
  label: string;
  /** Tool name registered with the engine (e.g. 'balance_check'). */
  toolName: string;
}

interface IntentRule {
  args?: Record<string, unknown>;
  argsBuilder?: (match: RegExpMatchArray) => Record<string, unknown>;
  label: string;
  pattern: RegExp;
  /**
   * When true, skip this rule if the message looks like a third-party
   * ask ("balance of funkii", "alice's balance"). Prevents the dispatcher
   * from pre-firing a SELF balance_check on top of the LLM's
   * correctly-targeted third-party balance_check.
   */
  skipIfThirdParty?: boolean;
  toolName: string;
}

// ---------------------------------------------------------------------------
// Helpers — ported byte-for-byte from legacy intent-dispatcher.ts
// ---------------------------------------------------------------------------

const FINANCIAL_NOUN_GROUP =
  "(?:balance|account|portfolio|wallet|holdings|assets|tokens|coins|net\\s*worth|health(?:\\s*factor)?|yield|earnings|positions?)";

function isThirdPartyAsk(message: string): boolean {
  const SELF_TARGETS = new Set(["me", "mine", "myself", "my"]);

  // Pattern 1: <name>'s <noun>. \w+ catches names but also "my" / "your" —
  // we filter those out by hand because Unicode \b makes the lookbehind
  // version too brittle across runtimes.
  const possessiveMatch = message.match(
    new RegExp(`\\b(\\w+)['\u2019]s\\s+${FINANCIAL_NOUN_GROUP}\\b`, "i")
  );
  if (possessiveMatch) {
    const owner = possessiveMatch[1].toLowerCase();
    if (owner !== "my" && owner !== "your" && owner !== "our") {
      return true;
    }
  }

  // Pattern 2: <noun> (of|for) <target>, where target isn't a self-pronoun.
  const ofForMatch = message.match(
    new RegExp(
      `\\b${FINANCIAL_NOUN_GROUP}\\s+(?:of|for)\\s+([\\w'\u2019.@-]+)`,
      "i"
    )
  );
  if (ofForMatch) {
    // [SPEC 30 Phase 1B.5 — 2026-05-14] CodeQL js/polynomial-redos flagged
    // `/[.,?!'"]+$/g` as backtracking on long `!`-runs in user input.
    // Replaced with a constant-time charwise loop: O(N) trim regardless
    // of input shape; no regex backtracking.
    const lower = ofForMatch[1].toLowerCase();
    const PUNCT = ".,?!'\"";
    let end = lower.length;
    while (end > 0 && PUNCT.includes(lower[end - 1])) {
      end--;
    }
    const target = lower.slice(0, end);
    if (!SELF_TARGETS.has(target)) {
      return true;
    }
  }

  // Pattern 3: explicit hex Sui address present (60-64 hex chars).
  if (/0x[a-fA-F0-9]{60,64}/.test(message)) {
    return true;
  }

  return false;
}

function hasSelfBalanceAsk(message: string): boolean {
  if (new RegExp(`\\bmy\\s+${FINANCIAL_NOUN_GROUP}\\b`, "i").test(message)) {
    return true;
  }
  const ofForMe = message.match(
    new RegExp(
      `\\b${FINANCIAL_NOUN_GROUP}\\s+(?:of|for)\\s+(me|mine|myself|my)\\b`,
      "i"
    )
  );
  if (ofForMe) {
    return true;
  }
  return false;
}

/**
 * Returns YYYY-MM-DD relative to today (server time). `0` = today,
 * `-1` = yesterday.
 *
 * NOTE: server time vs user time. Audric runs the dispatcher on the
 * Next.js server, so "today" is whatever the server thinks. For users
 * in very different timezones this can be off by one day at edges —
 * accepted as "good enough" since the existing transaction_history
 * `date` filter has the same property and we don't currently track
 * user TZ at the request layer.
 */
function isoDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// READ_INTENT_RULES — ported byte-for-byte from
//   `audric/apps/web/lib/engine/intent-dispatcher.ts` L209-349
//
// Order matters: when a message matches multiple rules (rare but possible
// for compound questions like "what's my balance and health factor?"),
// all matching tools dispatch in this order so cards render top-to-bottom
// in a predictable sequence.
//
// Patterns are intentionally narrow. False positives (dispatching a tool
// the user didn't actually ask about) waste an RPC call and clutter the
// UI with an irrelevant card; missed positives (no dispatch when one was
// warranted) just fall back to the existing LLM-driven flow. The cost
// asymmetry favors precision.
// ---------------------------------------------------------------------------

const READ_INTENT_RULES: readonly IntentRule[] = [
  // ────────────────────────── balance_check ──────────────────────────
  {
    toolName: "balance_check",
    args: {},
    label: "balance/net-worth direct read",
    pattern:
      /\b(?:net\s*worth|(?:what(?:'s|\s+is|\s+are)?\s+(?:my|the)\s+(?:total\s+)?(?:balance|wallet|holdings|net\s*worth|assets|tokens|coins))|(?:my\s+(?:balance|wallet|holdings|net\s*worth|assets|tokens|coins))|(?:(?:show|list)\s+(?:me\s+)?(?:all\s+)?my\s+(?:balance|wallet|holdings|assets|tokens|coins))|(?:how\s+much\s+(?:do\s+i\s+have|am\s+i\s+holding|is\s+in\s+my\s+wallet))|(?:what(?:'s|\s+is)?\s+in\s+my\s+wallet))\b/i,
    skipIfThirdParty: true,
  },

  // ────────────────────────── health_check ───────────────────────────
  {
    toolName: "health_check",
    args: {},
    label: "health/liquidation direct read",
    pattern:
      /\b(?:health\s*factor|liquidation(?:\s+risk)?|risk\s+of\s+liquidation|am\s+i\s+(?:safe|at\s+risk)|is\s+my\s+account\s+safe|borrow(?:ing)?\s+capacity|can\s+i\s+borrow(?:\s+more)?|how\s+much\s+can\s+i\s+borrow|max(?:imum)?\s+borrow|(?:full\s+)?health\s+check(?:\s+on\s+my\s+account)?|check\s+my\s+(?:account\s+)?health|run\s+a\s+health\s+check)\b/i,
    skipIfThirdParty: true,
  },

  // ────────────────────────── mpp_services ───────────────────────────
  {
    toolName: "mpp_services",
    args: {},
    label: "mpp services catalog",
    pattern:
      /\b(?:(?:show\s+(?:me\s+)?(?:all\s+)?(?:available\s+)?(?:mpp\s+)?services?(?:\s+(?:on\s+sui|catalog))?)|(?:list\s+(?:all\s+)?(?:available\s+)?(?:mpp\s+)?services?)|(?:available\s+(?:mpp\s+)?services?)|(?:what\s+(?:mpp\s+)?services?\s+(?:are\s+available|exist|do\s+(?:you|we)\s+have))|(?:mpp\s+services?)|(?:service\s+catalog))\b/i,
  },

  // ─────────────── transaction_history — last single tx ──────────────
  {
    toolName: "transaction_history",
    args: { limit: 1 },
    label: "last transaction direct read",
    pattern:
      /\b(?:what\s+(?:was|is)\s+|show\s+(?:me\s+)?)?my\s+last\s+(?:transaction|tx)\b(?!s)/i,
  },

  // ─────────────── transaction_history — today's activity ────────────
  {
    toolName: "transaction_history",
    argsBuilder: () => ({ date: isoDateOffset(0) }),
    label: "today's activity direct read",
    pattern:
      /\b(?:show\s+(?:me\s+)?)?today(?:['\u2019]?s)?\s+(?:activity|transactions?|tx)\b|\bwhat\s+did\s+i\s+do\s+today\b/i,
  },

  // ─────────────── transaction_history — yesterday's activity ────────
  {
    toolName: "transaction_history",
    argsBuilder: () => ({ date: isoDateOffset(-1) }),
    label: "yesterday's activity direct read",
    pattern:
      /\b(?:show\s+(?:me\s+)?)?yesterday(?:['\u2019]?s)?\s+(?:activity|transactions?|tx)\b|\bwhat\s+(?:did\s+i\s+do|happened)\s+yesterday\b/i,
  },

  // ─────────────────── activity_summary — services spend ─────────────
  {
    toolName: "activity_summary",
    args: { period: "month" },
    label: "services spend direct read",
    pattern:
      /\b(?:what|how\s+much)\s+(?:did|have)\s+i\s+(?:spen[dt]|paid?|use[ds]?)\b.*\b(?:services?|apis?|mpp|gateway|tools?)\b/i,
  },

  // ─────────────────── yield_summary — yield direct read ─────────────
  {
    toolName: "yield_summary",
    args: {},
    label: "yield earnings direct read",
    pattern:
      /\b(?:what(?:'s|\s+is)?\s+)?my\s+(?:current\s+|monthly\s+)?yield(?:\s+earnings?|\s+this\s+(?:week|month|year))?\b|\bshow\s+(?:me\s+)?my\s+yield(?:\s+earnings?)?\b|\bhow\s+much\s+(?:have\s+i\s+earned|am\s+i\s+earning|do\s+i\s+earn)\b|\bmy\s+earnings\b/i,
  },
];

// ---------------------------------------------------------------------------
// Classifier — ported byte-for-byte
// ---------------------------------------------------------------------------

/**
 * Stable JSON fingerprint of args. Used for dedup-key and the synthetic
 * call-ID discriminator.
 */
export function argsFingerprint(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  if (keys.length === 0) {
    return "";
  }
  const sorted: Record<string, unknown> = {};
  for (const k of keys) {
    sorted[k] = args[k];
  }
  return JSON.stringify(sorted);
}

export function classifyReadIntents(message: string): ReadIntent[] {
  if (!message || typeof message !== "string") {
    return [];
  }

  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const matches: ReadIntent[] = [];
  const seenKeys = new Set<string>();

  // Compute once per call so per-rule checks are O(1).
  const thirdParty = isThirdPartyAsk(trimmed);
  const selfAsk = hasSelfBalanceAsk(trimmed);
  const suppressSelfRules = thirdParty && !selfAsk;

  for (const rule of READ_INTENT_RULES) {
    if (rule.skipIfThirdParty && suppressSelfRules) {
      continue;
    }
    const m = trimmed.match(rule.pattern);
    if (!m) {
      continue;
    }
    const args = rule.argsBuilder
      ? rule.argsBuilder(m)
      : { ...(rule.args ?? {}) };
    const dedupKey = `${rule.toolName}:${argsFingerprint(args)}`;
    if (seenKeys.has(dedupKey)) {
      continue;
    }
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
 * Dedup the classified intent list by (toolName + argsFingerprint).
 *
 * Ported from `audric/apps/web/lib/engine/dispatch-intents.ts` —
 * preserves the function signature so future synthetic sources can be
 * added back in a structured way if needed. Today it just dedups.
 */
export interface DispatchIntentsInput {
  classified: readonly ReadIntent[];
}

export function buildDispatchIntents(
  input: DispatchIntentsInput
): ReadIntent[] {
  const seen = new Set<string>();
  const intents: ReadIntent[] = [];

  for (const intent of input.classified) {
    const key = `${intent.toolName}:${argsFingerprint(intent.args)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    intents.push(intent);
  }

  return intents;
}

/**
 * Generate a stable synthetic call ID for an injected tool dispatch.
 * Stable means: deterministic given (turnIndex, toolName, discriminator)
 * so retrying the same turn doesn't generate a different ID. The
 * `auto_` prefix is what `harness-metrics` keys off when reporting
 * which tools were pre-dispatched vs. LLM-called.
 */
export function makeAutoDispatchId(
  turnIndex: number,
  toolName: string,
  discriminator?: string
): string {
  const suffix = discriminator ? `_${discriminator}` : "";
  return `auto_${turnIndex}_${toolName}${suffix}`;
}

export function intentDiscriminator(intent: ReadIntent): string {
  const fp = argsFingerprint(intent.args);
  if (!fp) {
    return "";
  }
  // FNV-1a 32-bit hash → short alphanumeric token. Cheap; collisions
  // across distinct args within one turn are vanishingly rare.
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < fp.length; i++) {
    h ^= fp.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// dispatchIntentsToParts — NEW (replaces legacy chat-route SSE+ledger inject)
//
// Legacy `apps/web` chat route injected pre-fired reads two ways:
//   (a) into the engine's internal message ledger via `engine.loadMessages(...)`
//   (b) onto the SSE wire via `controller.enqueue(serializeSSE(event))`
//
// AI SDK v6 doesn't use SSE events — it uses UIMessage parts. This
// helper produces the equivalent shape:
//
//   - A synthetic assistant UIMessage with `tool-<name>` parts in
//     `output-available` state, appended to the messages[] passed
//     to `agent.stream({messages})`. `convertToModelMessages` then
//     translates each part into the canonical Anthropic
//     [tool_use, tool_result] ModelMessage pair (verified at
//     `node_modules/ai/dist/index.d.ts` + the AI SDK
//     `convertToModelMessages` implementation). The LLM sees the
//     pre-fired results as already-done history and narrates around
//     them without re-calling.
//
//   - The SAME parts are also written to the UIMessageStream writer
//     by the chat-route caller BEFORE `agent.stream` iterates. The
//     client renders each tool-* part via `<ToolResultRouter>`, the
//     same path it uses for LLM-issued tool calls.
//
// The helper is host-agnostic — it takes a tool registry (the read
// tools the chat route has wired) and a ToolContext to invoke them
// with. Intents whose tool isn't in the registry are gracefully
// skipped with a console.warn (matches legacy invokeReadTool
// fallback path).
// ---------------------------------------------------------------------------

export interface DispatchedReadPart {
  input: Record<string, unknown>;
  label: string;
  output: unknown;
  toolCallId: string;
  toolName: string;
}

export interface DispatchIntentsToPartsInput {
  /** Optional log prefix for the dispatcher's structured log lines. */
  logPrefix?: string;
  /** The user's latest message text (the dispatcher target). */
  message: string;
  /**
   * Map of tool-name → engine `Tool` instance. The dispatcher only
   * executes intents whose tool is in this map; unwired tools are
   * skipped with a warn.
   */
  registry: Map<string, Tool>;
  /** Server-side tool context used to invoke each tool's `.call()`. */
  toolContext: ToolContext;
  /** Turn index — used to build stable synthetic call IDs. */
  turnIndex: number;
}

/**
 * Run the classifier + pre-fire matching read tools.
 *
 * Returns the dispatched parts in classification order. Empty when no
 * intents matched OR none of the matched intents had a registered tool.
 *
 * Errors during tool execution surface as console.warn + skipped intent
 * (matches the legacy `invokeReadTool` graceful-fallback contract).
 * NEVER throws — a misconfigured dispatcher must not wedge a chat turn.
 */
export async function dispatchIntentsToParts(
  input: DispatchIntentsToPartsInput
): Promise<DispatchedReadPart[]> {
  const { message, toolContext, registry, turnIndex, logPrefix } = input;
  const prefix = logPrefix ?? "[web-v2 intent-dispatch]";

  const intents = buildDispatchIntents({
    classified: classifyReadIntents(message),
  });

  const messagePreview =
    message.length > 80 ? `${message.slice(0, 80)}…` : message;
  console.info(`${prefix} classified`, {
    turnIndex,
    messagePreview,
    intentCount: intents.length,
    intents: intents.map((i) => ({
      tool: i.toolName,
      label: i.label,
      args: i.args,
    })),
  });

  if (intents.length === 0) {
    return [];
  }

  const dispatched: DispatchedReadPart[] = [];

  for (const intent of intents) {
    const tool = registry.get(intent.toolName);
    if (!tool) {
      // Intent matched a tool that isn't wired in this host. Today
      // this is the common case for web-v2 (only balance_check is
      // exposed). Log + skip — matches legacy behavior when a tool
      // throws.
      console.warn(`${prefix} skipped — tool not in registry`, {
        toolName: intent.toolName,
        label: intent.label,
      });
      continue;
    }

    const callId = makeAutoDispatchId(
      turnIndex,
      intent.toolName,
      intentDiscriminator(intent)
    );

    try {
      const result = await tool.call(intent.args, toolContext);
      // `tool.call` returns `{data, displayText?}`. AI SDK consumes
      // the unwrapped `data` for tool-result parts — matches the
      // engine's `toAISDKTools` wrapper at
      // `packages/engine/src/v2/tool-wrapper.ts:148` which returns
      // `result.data`. The displayText is host-UI metadata that
      // doesn't go on the wire.
      dispatched.push({
        toolCallId: callId,
        toolName: intent.toolName,
        input: intent.args,
        output: result.data,
        label: intent.label,
      });
      console.info(`${prefix} dispatched`, {
        turnIndex,
        callId,
        tool: intent.toolName,
        label: intent.label,
      });
    } catch (dispatchErr) {
      console.warn(`${prefix} tool.call threw — falling back to LLM flow`, {
        toolName: intent.toolName,
        label: intent.label,
        error:
          dispatchErr instanceof Error
            ? dispatchErr.message
            : String(dispatchErr),
      });
    }
  }

  return dispatched;
}

/**
 * Build a synthetic assistant UIMessage carrying the pre-fired tool
 * results as `tool-<name>` parts in `output-available` state. The
 * message is appended to `messages[]` before `agent.stream({messages})`
 * so the LLM sees the pre-fired results as already-done history.
 *
 * `convertToModelMessages` translates this assistant message into the
 * canonical Anthropic [tool_use, tool_result] ModelMessage pair (see
 * `node_modules/ai/dist/index.d.ts` + the convertToModelMessages
 * implementation at `node_modules/.../ai/src/ui/convert-to-model-messages.ts`
 * L307-313 for the `output-available` branch).
 *
 * The chat-route caller is responsible for ALSO writing each
 * `tool-input-available` + `tool-output-available` part to the
 * UIMessageStream writer so the client renders the cards immediately
 * (without waiting for the LLM to narrate).
 */
export function synthesizeAssistantToolMessage(
  parts: DispatchedReadPart[]
): Omit<UIMessage, "id"> {
  return {
    role: "assistant",
    parts: parts.map((p) => ({
      // The static-tool UIMessagePart type is `tool-<NAME>` with
      // state-based payload. `state: 'output-available'` carries
      // both input + output — convertToModelMessages translates
      // this into the [tool_use, tool_result] Anthropic pair.
      type: `tool-${p.toolName}`,
      state: "output-available" as const,
      toolCallId: p.toolCallId,
      input: p.input,
      output: p.output,
    })) as UIMessage["parts"],
  };
}
