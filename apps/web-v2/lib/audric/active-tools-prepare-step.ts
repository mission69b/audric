/**
 * AI SDK `prepareStep` callback that narrows the agent's active tool set
 * per turn via the heuristic intent classifier.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 *
 * ## What this does
 *
 * On step 0 of every turn:
 *   1. Extract the latest USER text message from `messages`.
 *   2. Classify intent via `intent-classifier.ts`.
 *   3. Select the union of tool names the LLM needs for that intent
 *      (+ `ALWAYS_ON_TOOLS` + any host-supplied `alwaysInclude` list).
 *   4. Filter against the agent's actual tool registry (drops names
 *      that aren't wired in this host configuration).
 *   5. Cache the result for subsequent steps in the same turn — the
 *      user's intent doesn't change mid-turn, so step 1+ re-uses
 *      step 0's classification (no re-classification cost, consistent
 *      tool surface across multi-step turns).
 *
 * Returns `{ activeTools }` — AI SDK uses this to limit which tool
 * definitions are sent to the model in the next request, reducing
 * prompt size from ~26 tools (~5K-7K tokens of schemas) to ~5-12
 * tools (~1K-2K tokens). Cache hit rates improve because the active
 * subset is more stable across similar-intent turns.
 *
 * ## Resume turn handling
 *
 * After HITL confirm, AI SDK's `convertToModelMessages` emits tool-result
 * blocks as `role: 'tool'` messages (NOT `role: 'user'`). The resume
 * turn's message array therefore looks like:
 *
 *   [..., user: "save 10 USDC", assistant: tool-call, tool: tool-result]
 *
 * `extractLatestUserMessage` walks BACKWARDS skipping non-user roles, so
 * it finds the ORIGINAL user prompt ("save 10 USDC") and re-classifies
 * the intent. Result: resume turn gets the SAME activeTools subset as
 * the original turn — `save_deposit`, `savings_info`, etc. stay
 * available for the LLM's post-confirm narration.
 *
 * ## Conversational carryover [HOTFIX 2026-05-24]
 *
 * When the current user message classifies as `low` confidence (no
 * keyword matches → general fallback), the closure looks back ONE
 * user-message earlier and inherits THAT message's intent if it
 * classified as `high` or `medium`. This handles the very common
 * follow-up case where the user typed an established intent's
 * continuation phrase ("yea lets go", "yes do it", "use USDsui
 * instead") OR typo'd a keyword ("yeild" → /yield/i miss).
 *
 * Implementation: pure-functional — `extractPreviousUserMessage` walks
 * back past the latest user message and reads the prior one's text.
 * Adds at most one extra `classifyIntent` call per low-confidence
 * turn. Always preserves safety: if the previous turn was ALSO low
 * confidence, we fall through to the `general` fallback (which now
 * includes the common writes — see `intent-classifier.ts`
 * `TOOLS_BY_INTENT.general`, hardened in the same 2026-05-24 hotfix).
 *
 * The smoke that motivated this change: turn 1 was "what's the most
 * I can save this week..." (correctly classified `save`). Turn 2 was
 * "yea lets go with the usdsui option and let me know how much weekly
 * yeild i get from it" — typo'd `yeild` defeated /yield/i, and no
 * other save keywords matched ("lets go", "usdsui" are noise). Result:
 * `save_deposit` got stripped from activeTools and the model said
 * "I don't have a save_deposit tool". With carryover, turn 2 inherits
 * turn 1's `save` classification and `save_deposit` stays available.
 *
 * ## Composition with other prepareStep callbacks
 *
 * Web-v2's chat route already wires `buildMemoryPrepareStep` for the
 * `<memory_recall>` system-prompt injection. AI SDK only accepts one
 * `prepareStep`, so we compose the two via `composePrepareSteps`.
 * Each callback owns its own return field (`system` from memwal,
 * `activeTools` from here); the composer merges them into one
 * `PrepareStepResult`.
 *
 * ## Why heuristic v1 instead of LLM classifier
 *
 * See head comment in `intent-classifier.ts`. TL;DR: sub-millisecond,
 * deterministic, easy to extend. Misclassifications fall through to
 * `general` (still gives the LLM the most common read tools) —
 * conservative-by-construction.
 *
 * ## Observability
 *
 * Every prepareStep invocation emits one log line tagged
 * `[web-v2 active-tools-prepare-step]` with:
 *   - `step=N` — step number (0 = classification step, 1+ = cached)
 *   - `query_chars=N` — length of extracted user message (PII-safe)
 *   - `intents=...` — comma-separated intent names
 *   - `confidence=high|medium|low`
 *   - `tool_count=N` — final size of activeTools array
 *   - `outcome=fresh|cached|carried-over|empty-query-fallback` — provenance
 *     (`carried-over` = current turn was low confidence, inherited the
 *     previous user message's intent — see "Conversational carryover")
 *
 * Same posture as memwal-prepare-step: SHAPE not CONTENT (no query
 * text, no tool names beyond the intent label).
 */

import type { ModelMessage } from "ai";
import {
  classifyIntent,
  type IntentResult,
  selectActiveTools,
} from "./intent-classifier";

/**
 * Pull the latest USER message text from an AI SDK `ModelMessage[]`.
 *
 * Returns `''` if no user message exists OR the latest user message
 * has no text content. Mirrors `memwal-prepare-step.ts:extractLatest
 * UserMessage` exactly. When the engine eventually exports an
 * `extractLatestUserMessage` helper, both sites consolidate in the
 * same diff.
 *
 * Resume turn behaviour: AI SDK puts tool-results in `role: 'tool'`
 * messages (not `role: 'user'`), so this loop correctly skips past
 * them and finds the original user text prompt further back in the
 * history.
 */
function extractLatestUserMessage(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") {
      continue;
    }
    return userContentToText(msg.content);
  }
  return "";
}

/**
 * Pull the user message text immediately preceding the latest user
 * message. Used for low-confidence carryover (see §"Conversational
 * carryover" in the file header).
 *
 * Walks back from end:
 *   1. Skip non-user roles
 *   2. Skip the FIRST user message found (the "latest")
 *   3. Return the SECOND user message's text content
 *
 * Returns `''` when fewer than two user messages exist (typically:
 * first turn of a conversation).
 */
function extractPreviousUserMessage(messages: ModelMessage[]): string {
  let userMessagesSeen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") {
      continue;
    }
    userMessagesSeen += 1;
    if (userMessagesSeen === 2) {
      return userContentToText(msg.content);
    }
  }
  return "";
}

function userContentToText(content: ModelMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" && p !== null && "type" in p && p.type === "text"
    )
    .map((p) => p.text)
    .join(" ")
    .trim();
}

export interface ActiveToolsPrepareStepOptions {
  /**
   * Tools to include in `activeTools` regardless of classified intent.
   * Use for host-managed tools that don't fit the engine's intent
   * model (e.g., `perplexity_search` from the gateway path —
   * "general web search" doesn't map to a finance intent, so the
   * route opts it in unconditionally when `useGateway === true`).
   */
  alwaysInclude?: readonly string[];
  /**
   * The set of tool names actually registered on the agent. Used to
   * filter the classifier's tool selection so we never return a name
   * that AI SDK can't resolve to a definition. Pass `Object.keys(tools)`
   * from the route's final ToolSet.
   */
  registeredToolNames: readonly string[];
}

/**
 * The narrowest shape of the AI SDK `PrepareStepFunction` argument we
 * actually consume. The real type carries `steps`, `model`, `experimental_
 * context` — we ignore those, so a structural subtype is enough.
 */
type PrepareStepArg = {
  stepNumber: number;
  messages: ModelMessage[];
};

type PrepareStepReturn = { activeTools?: string[] };

/**
 * Build the active-tools prepareStep callback for a single chat request.
 *
 * The returned closure owns per-request state (the cached intent +
 * tool list). Each call to this factory produces a fresh cache;
 * do not reuse the callback across requests.
 *
 * Returns `undefined` when no tools are registered (degenerate case;
 * activeTools would be an empty array which AI SDK might interpret as
 * "tool calls disabled" — undefined sentinel is safer).
 */
export function buildActiveToolsPrepareStep(
  opts: ActiveToolsPrepareStepOptions
): ((args: PrepareStepArg) => Promise<PrepareStepReturn>) | undefined {
  if (opts.registeredToolNames.length === 0) {
    return;
  }

  const registeredSet = new Set(opts.registeredToolNames);
  const alwaysInclude = opts.alwaysInclude ?? [];

  let cachedActiveTools: string[] | null = null;
  let cachedIntent: IntentResult | null = null;

  return ({ stepNumber, messages }) => {
    if (stepNumber !== 0 && cachedActiveTools !== null) {
      console.info(
        `[web-v2 active-tools-prepare-step] step=${stepNumber} outcome=cached intents=${cachedIntent?.intents.join(",") ?? "(none)"} tool_count=${cachedActiveTools.length}`
      );
      return Promise.resolve({ activeTools: cachedActiveTools });
    }

    const userMessage = extractLatestUserMessage(messages);
    let outcome: "carried-over" | "empty-query-fallback" | "fresh";
    let intent: IntentResult;

    if (userMessage.length === 0) {
      // Resume turn (tool-result only) OR malformed message list.
      // Fall back to `general` — gives the LLM the most common read
      // tools so it can still narrate the resume turn without missing
      // a critical capability.
      intent = { intents: ["general"], confidence: "low" };
      outcome = "empty-query-fallback";
    } else {
      intent = classifyIntent(userMessage);
      outcome = "fresh";

      // [HOTFIX 2026-05-24 — smoke caught "yea lets go with the usdsui
      // option and let me know how much weekly yeild i get from it"
      // classifying as general/low because the user typo'd "yeild" so
      // /yield/i didn't match. Result: `save_deposit` got stripped from
      // activeTools and the model said "I don't have save_deposit".]
      //
      // When the CURRENT user message classifies as `low` confidence
      // (no keyword match → general fallback), look back at the PREVIOUS
      // user message and inherit ITS intent if that was high/medium.
      // This catches the very common conversational follow-up cases:
      //   - "yea lets go" / "yes" / "do it" / "go ahead"
      //   - "use USDsui instead" / "actually no, do USDC"
      //   - typo'd continuations of an established intent
      //
      // Cost: one extra `classifyIntent` call (sub-millisecond, pure
      // function, no I/O) per low-confidence turn. Always preserves
      // safety: if the previous message ALSO classified as low/general,
      // we fall through to the same fallback we'd use today (now
      // backed by `general` containing common writes — see
      // intent-classifier.ts `TOOLS_BY_INTENT.general`).
      if (intent.confidence === "low") {
        const previousUserMessage = extractPreviousUserMessage(messages);
        if (previousUserMessage.length > 0) {
          const previousIntent = classifyIntent(previousUserMessage);
          if (previousIntent.confidence !== "low") {
            intent = previousIntent;
            outcome = "carried-over";
          }
        }
      }
    }

    // Selector union + always-include + filter to registered tools.
    const selected = selectActiveTools(intent);
    const set = new Set<string>(selected);
    for (const name of alwaysInclude) {
      set.add(name);
    }
    const filtered = [...set].filter((name) => registeredSet.has(name));

    cachedActiveTools = filtered;
    cachedIntent = intent;

    console.info(
      `[web-v2 active-tools-prepare-step] step=${stepNumber} query_chars=${userMessage.length} intents=${intent.intents.join(",")} confidence=${intent.confidence} tool_count=${filtered.length} outcome=${outcome}`
    );

    return Promise.resolve({ activeTools: filtered });
  };
}
