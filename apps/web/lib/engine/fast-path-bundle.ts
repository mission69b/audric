/**
 * Fast-path bundle dispatcher (SPEC 14 Phase 2)
 *
 * When the chat route receives a short affirmative reply ("Confirm",
 * "Yes", "go ahead") AND there's a fresh `prepare_bundle` proposal
 * stashed in Redis for this session, this module:
 *
 *   1. Reads + atomically consumes the stash.
 *   2. Stamps per-step `attemptId`s + `toolUseId`s.
 *   3. Builds a structurally-valid `PendingAction` with `steps[]`.
 *   4. Returns it for the chat route to yield as a `pending_action`
 *      SSE event WITHOUT round-tripping the LLM.
 *
 * This is the SPEC 14 fix for the load-bearing-LLM-emission-timing
 * problem. The bundle invariant (every write in ONE assistant message)
 * was the failure mode of `1.14.0 → 1.14.3` — four prompt-level
 * attempts to coerce LLM behavior, each with its own escape hatch.
 * The fast path eliminates the LLM from confirm turns entirely, so
 * the bundle is committed at PLAN time (the `prepare_bundle` call)
 * and merely DISPATCHED at confirm time.
 *
 * Cross-references:
 *   - `prepare-bundle-tool.ts` — the LLM-callable plan-time tool that
 *     populates the stash.
 *   - `bundle-proposal-store.ts` — Upstash Redis CRUD with 60s TTL.
 *   - `confirm-detection.ts:isAffirmativeConfirmReply` — the same
 *     regex the Haiku promotion path uses.
 *   - `app/api/engine/chat/route.ts` — the lone caller.
 */

import type {
  Message,
  PendingAction,
  PendingToolCall,
  SwapQuoteReadEntry,
  Tool,
} from '@t2000/engine';
import {
  composeBundleFromToolResults,
  getTelemetrySink,
  REGENERATABLE_READ_TOOLS,
} from '@t2000/engine';
import type { SerializedCetusRoute } from '@t2000/sdk';
import {
  detectPriorPlanContext,
  isAffirmativeConfirmReply,
  looksLikeNegativeReply,
} from './confirm-detection';
import {
  consumeBundleProposal,
  type BundleProposal,
} from './bundle-proposal-store';

interface FastPathConsumeOpts {
  sessionId: string | undefined;
  walletAddress: string | undefined;
  trimmedMessage: string;
  turnIndex: number;
  /**
   * [SPEC 15 Phase 1.5] Conversation history up to (but NOT including)
   * the current user message. Used by `detectPriorPlanContext` to
   * admit the fast path on plan-context-confirmed turns even when the
   * strict regex (`isAffirmativeConfirmReply`) misses.
   *
   * Optional for backward-compat — when omitted, behavior is the
   * legacy regex-only admission (no plan-context override).
   */
  history?: Message[];
  /**
   * [SPEC 15 Phase 2] Override the intent-check gates. Set by the chat
   * route when the user clicked the Confirm chip — chip click is a
   * 100% intent signal, so we skip the regex / plan-context / negative-
   * reply checks entirely.
   *
   * **What this skips:** `isAffirmativeConfirmReply`,
   * `looksLikeNegativeReply`, `detectPriorPlanContext`.
   *
   * **What this DOES NOT skip:** session-validity (sessionId,
   * walletAddress), stash existence (`consumeBundleProposal` returning
   * null → `no_stash`), wallet-mismatch (proposal.walletAddress vs
   * request walletAddress). Chip is an intent signal but NOT a
   * session-state signal — a chip click against an expired stash or
   * a different wallet should still skip cleanly with the matching
   * `recordSkip` reason.
   *
   * Tagged on the dispatch counter as `admitted_via='chip'`.
   */
  forceAdmit?: 'chip';
  /**
   * [SPEC 15 v0.7 follow-up #3 — single-source bundle composer,
   * 2026-05-04] Engine tool registry passed through from the chat
   * route's `engine` instance (`engine.getTools()`). Required so the
   * fast-path can call the canonical
   * `composeBundleFromToolResults(...)` helper exported from
   * `@t2000/engine` ≥1.17.0 — that's the same function the engine's
   * own agent loop uses to produce bundle PendingActions, so
   * chip-confirmed bundles automatically inherit every field the
   * engine bundles carry (canRegenerate, regenerateInput, quoteAge,
   * modifiableFields, inputCoinFromStep re-wiring, etc.).
   *
   * Optional for backward-compat with tests + any pre-1.17 caller —
   * when omitted, the fast-path falls through to a no-op (matches the
   * pre-converge behavior of "no regenerate fields populated").
   * Production chat route MUST pass this.
   */
  tools?: ReadonlyArray<Tool>;
}

/**
 * How the fast path decided to admit this turn.
 *
 *   - 'regex': strict `CONFIRM_PATTERN` match (Phase 1 baseline).
 *     Maintains the 108ms bypass on the canonical happy path.
 *   - 'plan_context': regex missed, but the prior assistant turn was
 *     a multi-write Payment Intent plan AND the user's reply isn't
 *     clearly negative. SPEC 15 Phase 1.5 — catches "do it bro" /
 *     "vamos" / voice transcripts / non-English confirms that the
 *     regex would otherwise drop into LLM re-planning (which
 *     decomposes bundles — see 04:31 prod regression report).
 *   - 'chip': SPEC 15 Phase 2. The user clicked the Confirm chip.
 *     Chip click is a 100% intent signal — no regex, no plan-context
 *     match, no language guesswork. The chat route signals this via
 *     `FastPathConsumeOpts.forceAdmit='chip'`. Session-validity, stash
 *     existence, and wallet-match checks still run.
 */
/**
 * Exported (not just internal) so callers can tag downstream telemetry
 * accurately. SPEC 15 Phase 2's chat-route emits
 * `audric.confirm_flow.dispatch_count{admitted_via=...}` and needs the
 * exact admission cause — without this export it would have to coarse-
 * grain 'regex' / 'plan_context' as a single 'text' bucket.
 */
export type AdmittedVia = 'regex' | 'plan_context' | 'chip';

interface FastPathHit {
  /** Constructed bundle, ready to enqueue as `pending_action` SSE. */
  action: PendingAction;
  /** Original stashed proposal — handy for telemetry + post-emit logs. */
  proposal: BundleProposal;
  /**
   * Synthetic assistant text the chat route should append to the
   * engine's message ledger so chat history stays coherent. Without
   * this, the user's "Confirm" lands in session.messages with no
   * matching assistant turn, which breaks (a) the chat-history UI and
   * (b) the next turn's LLM prompt (it sees a hanging plan turn).
   *
   * Intentionally text-only — NOT a synthesised tool_use block. The
   * tool_use block lives on `action.steps[].toolUseId` for the
   * downstream `composeTx` call; the LEDGER message is just a human-
   * readable acknowledgment of the bundle.
   */
  syntheticAssistantText: string;
  /**
   * [SPEC 15 Phase 2] How this hit was admitted, surfaced so callers
   * can tag the `audric.confirm_flow.dispatch_count` counter with the
   * precise admission cause (chip / regex / plan_context). The
   * function-internal counter (`audric.bundle.fast_path_dispatched`)
   * already has this tag, but exposing it here lets the chat route
   * avoid coarse-graining text dispatches when emitting the new
   * confirm-flow counter.
   */
  admittedVia: AdmittedVia;
}

/**
 * Reason the fast path declined. Surfaces as the `reason` label on
 * `audric.bundle.fast_path_skipped`. Helps us tell apart the
 * legitimate "no-stash" steady state from misuse cases (wallet
 * mismatch, expired) that need investigation.
 *
 * Phase 1.5 additions:
 *   - 'negative_reply': user said something that looks negative (no /
 *     wait / cancel / actually / change…). Plan-context was detected,
 *     but the user is clearly not confirming. Skipping is correct —
 *     LLM picks up the turn and handles modifications/cancellations.
 *   - 'no_plan_context': regex missed AND prior turn isn't a
 *     multi-write plan. Reduces ambiguity in dashboards by separating
 *     "user typed gibberish on a plan turn" from "user typed
 *     something on a non-plan turn" (the latter is the legit steady-
 *     state of every non-confirm chat message).
 */
type SkipReason =
  | 'no_session'
  | 'no_wallet'
  | 'not_affirmative'
  | 'no_plan_context'
  | 'negative_reply'
  | 'no_stash'
  | 'wallet_mismatch';

function recordSkip(reason: SkipReason): null {
  getTelemetrySink().counter('audric.bundle.fast_path_skipped', { reason });
  return null;
}

/**
 * [SPEC 15 v0.7 follow-up #3 — single-source bundle composer,
 * 2026-05-04] Walk back through `history` to collect every
 * regeneratable read `tool_use` block from the **prior agent turn**
 * (every assistant message between the most recent human user
 * message and the end of history). The fast-path bundle was
 * assembled from those reads' outputs — `swap_quote` for the swap
 * leg, `rates_info` for the save leg — and we need their toolUseIds
 * threaded onto the dispatched `PendingAction` so the
 * PermissionCard's `↻ Refresh quote` button can re-fire them.
 *
 * **Why "the prior agent turn" not "the last assistant message".**
 * A multi-tool-step agent loop emits MULTIPLE assistant messages per
 * user turn — one per loop iteration. Example for "swap 10 USDC for
 * SUI then save 10 USDC":
 *
 *   user:      "swap 10 USDC for SUI then save 10 USDC"
 *   assistant: tool_use(swap_quote) + tool_use(rates_info)
 *   user:      tool_result(swap_quote) + tool_result(rates_info) ← synthetic
 *   assistant: tool_use(prepare_bundle) + text("Here's your plan…")
 *
 * The chip-Confirm fast-path admits AFTER the second assistant
 * message lands. The pre-this-commit walk only inspected
 * `history[history.length-1]` (the last assistant message), so it
 * found `prepare_bundle` (not regeneratable) and missed `swap_quote`
 * (regeneratable). Result: bundle shipped with `canRegenerate=false`,
 * no Refresh button on the PermissionCard. **This is the bug.**
 *
 * **Why scan history (vs. stashing in `BundleProposal`).** The
 * `prepare_bundle` tool doesn't have access to same-turn read tool_use
 * ids via `ToolContext` — they're at the message level, not the tool
 * level. Scanning history at consume-time is structurally simpler
 * than threading a new field through every tool's signature, and the
 * data is already there.
 *
 * **Synthetic-vs-human user message disambiguation.** Anthropic's API
 * encodes both human-typed messages AND tool_result echoes as
 * `role: 'user'`. A "synthetic" tool_result message is identified by
 * having any `tool_result` content block. The walk stops at the first
 * NON-synthetic user message it encounters (the actual prior
 * human prompt) — assistant messages between it and the end of
 * history are the prior agent turn.
 *
 * Returns null when no regeneratable reads are found in the prior
 * agent turn — the bundle then ships with `canRegenerate: false`.
 */
function findContributingReadsFromHistory(
  history: Message[] | undefined,
): Array<{ toolUseId: string; toolName: string }> | null {
  if (!history || history.length === 0) return null;

  let priorUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== 'user') continue;
    const isSyntheticToolResult = msg.content.some(
      (b) => b.type === 'tool_result',
    );
    if (!isSyntheticToolResult) {
      priorUserIdx = i;
      break;
    }
  }

  const reads: Array<{ toolUseId: string; toolName: string }> = [];
  for (let i = priorUserIdx + 1; i < history.length; i++) {
    const msg = history[i];
    if (msg.role !== 'assistant') continue;
    for (const block of msg.content) {
      if (block.type !== 'tool_use') continue;
      const tu = block as { id: string; name: string };
      if (REGENERATABLE_READ_TOOLS.has(tu.name)) {
        reads.push({ toolUseId: tu.id, toolName: tu.name });
      }
    }
  }
  return reads.length > 0 ? reads : null;
}

/**
 * [SPEC 20.2 / D-1 (a) bundle gap fix — 2026-05-10] Walk persisted
 * `history` to recover `swap_quote` results so the fast-path bundle
 * composer can thread `step.cetusRoute` for `swap_execute` legs.
 *
 * **Why this exists.** The pre-fix `buildPendingActionFromProposal`
 * called `composeBundleFromToolResults(...)` WITHOUT `swapQuoteReads`,
 * so the engine composer's per-step `findMatchingCetusRoute` never
 * fired. Result: every bundled swap shipped with `cetusRoute:
 * undefined` → audric's chat-route extractor had nothing to mirror
 * onto `TurnMetrics.cetusRoute` → the SPEC 20.2 fast-path on
 * `/api/transactions/prepare` couldn't fire → bundles paid the full
 * Cetus aggregator round-trip at confirm time.
 *
 * **The data is already in `history`.** The engine emits each
 * tool_result with `content: JSON.stringify(result)` (engine.ts
 * line ~1503). For successful `swap_quote` calls, the result
 * contains the `serializedRoute` either at the top level or under
 * `data.serializedRoute` (engine.ts line ~1483-1497 handles both
 * shapes). We mirror that defensive parsing here so the fast-path
 * sees what the engine's own bundle composition path sees.
 *
 * **Why not stash routes in `BundleProposal`.** The `prepare_bundle`
 * tool only receives its own input + `ToolContext` — it does NOT
 * see the same-turn `swap_quote` results. Threading those through a
 * new `ToolContext` field would require a new engine API surface
 * and a Redis schema migration. History walking reuses the existing
 * persisted ledger for zero new state. (See `findContributingReads
 * FromHistory` above for the same pattern applied to regenerate-
 * field derivation.)
 *
 * **Why scan FULL history (not just same agent turn) — 2026-05-10
 * follow-on fix.** The first cut of this walker stopped at the most
 * recent non-synthetic user message, on the theory that "stale
 * cross-turn routes shouldn't match." Production smoke disproved
 * that. The engine's `microcompact` (engine.ts line ~1267) runs
 * every agent loop and DEDUPLICATES identical `swap_quote` calls —
 * the second call's `tool_result.content` is replaced with
 * `[Same result as call #N — swap_quote with identical inputs.
 * Result unchanged.]`. That placeholder lands in `session.messages`
 * because the engine writes its post-microcompact `this.messages`
 * back to the store after the turn.
 *
 * Concrete prod trace: a single swap (USDC→SUI, 0.5) in turn 1, then
 * a bundle plan ("swap 0.5 USDC then save the rest") in turn 4 that
 * re-quotes the same pair. By the time fast-path fires on "Confirm",
 * the bundle-turn `tool_result` is the placeholder string —
 * `JSON.parse` rejects it, walker returns `[]`, `step.cetusRoute`
 * stays undefined, prepare-route logs `routePresent=false path=bundle`.
 *
 * Walking FULL history finds the un-deduped FIRST call's
 * tool_result (msg [6] in the prod trace), parses out its
 * `serializedRoute`, and threads it onto the step. Safety: audric
 * prepare-route runs `validateAndDecodeCetusRoute` which calls
 * `isCetusRouteFresh` (30s default, on the route's own
 * `discoveredAt` field). Routes older than that are silently dropped
 * and the legacy `findSwapRoute()` fallback runs — same correctness,
 * just slower. So worst case = baseline behavior; common case = fast
 * path fires.
 *
 * Long-term cleaner fix: set `cacheable: false` on `swap_quote` in
 * `@t2000/engine` so microcompact never dedupes quote results. Quote
 * results legitimately vary per call (pool reserves, slippage
 * windows). Tracked separately — until then, this walker handles it.
 *
 * **`timestamp: 0` is intentional.** The engine composer uses
 * `swapQuoteReads[*].timestamp` for nothing — `findMatchingCetusRoute`
 * matches on `(from, to, amount, byAmountIn)` only and ignores
 * timestamps. The freshness gate lives downstream as described above.
 *
 * Returns `[]` (empty array, not null) when nothing matched — the
 * engine composer treats undefined/empty identically (`if
 * (input.swapQuoteReads)` guard at compose-bundle.ts ~line 363).
 */
function findSwapQuoteReadsFromHistory(
  history: Message[] | undefined,
): SwapQuoteReadEntry[] {
  if (!history || history.length === 0) return [];

  // Pass 1: index every `swap_quote` tool_use block across ALL
  // history (toolUseId → typed input). Defensive shape check —
  // skip blocks whose input doesn't have the expected fields rather
  // than letting a downstream `findMatchingCetusRoute` throw on
  // `.toLowerCase()` of a non-string.
  const swapQuoteInputs = new Map<
    string,
    { from: string; to: string; amount: number; byAmountIn?: boolean }
  >();
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role !== 'assistant') continue;
    for (const block of msg.content) {
      if (block.type !== 'tool_use') continue;
      const tu = block as { id: string; name: string; input: unknown };
      if (tu.name !== 'swap_quote') continue;
      const inp = tu.input as {
        from?: unknown;
        to?: unknown;
        amount?: unknown;
        byAmountIn?: unknown;
      } | null;
      if (
        !inp ||
        typeof inp.from !== 'string' ||
        typeof inp.to !== 'string' ||
        typeof inp.amount !== 'number'
      ) {
        continue;
      }
      swapQuoteInputs.set(tu.id, {
        from: inp.from,
        to: inp.to,
        amount: inp.amount,
        ...(typeof inp.byAmountIn === 'boolean' ? { byAmountIn: inp.byAmountIn } : {}),
      });
    }
  }
  if (swapQuoteInputs.size === 0) return [];

  // Pass 2: walk ALL history forward, find each tool_result whose
  // toolUseId matches a swap_quote tool_use we indexed, parse the
  // JSON content, extract `serializedRoute` (top-level OR under
  // `data.`), pair with the captured input. Microcompact placeholders
  // fail JSON.parse and are silently skipped — the corresponding
  // un-deduped earlier call (if any) is collected instead.
  // Chronological append order means `findMatchingCetusRoute`'s
  // reverse iteration prefers the most recent matching route.
  const reads: SwapQuoteReadEntry[] = [];
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role !== 'user') continue;
    for (const block of msg.content) {
      if (block.type !== 'tool_result') continue;
      const tr = block as {
        toolUseId: string;
        content: unknown;
        isError?: boolean;
      };
      if (tr.isError) continue;
      const input = swapQuoteInputs.get(tr.toolUseId);
      if (!input) continue;
      if (typeof tr.content !== 'string') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(tr.content);
      } catch {
        continue;
      }
      const r = parsed as
        | { serializedRoute?: unknown; data?: { serializedRoute?: unknown } | null }
        | null;
      const fromData =
        r?.data && typeof r.data === 'object'
          ? (r.data as { serializedRoute?: unknown })
          : null;
      const serializedRoute = (r?.serializedRoute ?? fromData?.serializedRoute) as
        | SerializedCetusRoute
        | undefined;
      if (!serializedRoute) continue;
      reads.push({
        toolUseId: tr.toolUseId,
        input,
        result: { serializedRoute },
        timestamp: 0,
      });
    }
  }

  return reads;
}

/**
 * [SPEC 15 v0.7 follow-up #3 — single-source bundle composer,
 * 2026-05-04] Construct a `PendingAction` from a stashed proposal.
 *
 * **Architecture: fast-path is now a thin adapter.** Pre-v1.17 this
 * file maintained its own bundle composer (~200 lines: `describeStep`,
 * step assembly, regenerate-fields derivation). It drifted from
 * `composeBundleFromToolResults` in the engine three times in 24
 * hours (no `canRegenerate`, no `modifiableFields`, slightly different
 * step shape). Each drift surfaced as a production bug.
 *
 * Now: convert `BundleProposal.steps` → `PendingToolCall[]`, build
 * synthetic `readResults` from history, and call the engine's
 * canonical `composeBundleFromToolResults(...)`. Future bundle-shape
 * additions (new fields, new flags) propagate to fast-path bundles
 * automatically — no audric-side change required.
 *
 * **The two non-trivial decisions in this adapter.**
 *
 *   1. **`toolUseId` carries a `fastpath_` prefix.** Engine bundles
 *      use the LLM's tool_use ids (`toolu_…`); fast-path bundles use
 *      `fastpath_<bundleId>_<i>`. Log analysis depends on the prefix
 *      to tell the two paths apart, so we set it on each
 *      `PendingToolCall.id` before handing off to the composer.
 *
 *   2. **`readResults[*].timestamp` uses `proposal.validatedAt`.**
 *      The history walk extracts `tool_use` block ids but not their
 *      execution timestamps (those aren't preserved on persisted
 *      messages). `validatedAt` is the moment `prepare_bundle`
 *      finished, which is within ~hundreds of ms of the contributing
 *      reads landing. Good-enough for `quoteAge` UX (the value drives
 *      a "QUOTE Ns OLD" badge — sub-second precision is irrelevant).
 *
 * Required `tools` for engine composer's tool lookup
 * (`describeAction` + `getModifiableFields` + bundleable check). The
 * caller MUST pass `engine.getTools()`. Falls back to a synthetic
 * "tools missing" `PendingAction` only in test/dev scenarios — see
 * the `tools` parameter on `FastPathConsumeOpts`.
 */
function buildPendingActionFromProposal(
  proposal: BundleProposal,
  turnIndex: number,
  tools: ReadonlyArray<Tool> | undefined,
  history?: Message[],
): PendingAction {
  if (!tools || tools.length === 0) {
    throw new Error(
      'fast-path-bundle: `tools` is required to compose a bundle ' +
      '(pass `engine.getTools()` from the chat route). Without it ' +
      'the engine composer cannot resolve tool descriptions or ' +
      'modifiable-fields. SPEC 15 v0.7 follow-up #3.',
    );
  }

  const pendingWrites: PendingToolCall[] = proposal.steps.map((s, i) => ({
    id: `fastpath_${proposal.bundleId}_${i}`,
    name: s.toolName,
    input: s.input,
  }));

  const contributingReads = findContributingReadsFromHistory(history);
  const readResults = (contributingReads ?? []).map((r) => ({
    toolUseId: r.toolUseId,
    toolName: r.toolName,
    timestamp: proposal.validatedAt,
  }));

  // [SPEC 20.2 / D-1 (a) bundle gap fix — 2026-05-10] Recover same-
  // turn `swap_quote` results from history so the engine composer
  // can thread `step.cetusRoute` for `swap_execute` legs. Empty
  // array is fine — composer's `if (input.swapQuoteReads)` guard
  // tolerates it identically to undefined.
  const historyReads = findSwapQuoteReadsFromHistory(history);

  // [SPEC 22.4 — 2026-05-10] Plan-time route stash override. For each
  // proposal step with a `cetusRoute` (set by `prepare_bundle`'s plan-
  // time `getSwapQuote` call), synthesize a `SwapQuoteReadEntry` that
  // matches the step's input. APPENDED after history reads so the
  // engine composer's `findMatchingCetusRoute` (reverse iteration —
  // last match wins) prefers the fresher plan-time route over any
  // older history-walked route.
  //
  // Why append vs. replace: a plan-time fetch failure leaves
  // `step.cetusRoute` undefined; the history-walk fallback still has
  // a chance to match. Both arrays coexisting is the graceful-degrade
  // shape (if both miss, audric prepare-route runs `findSwapRoute()`
  // — same as pre-22.4 behavior).
  const stashReads: SwapQuoteReadEntry[] = [];
  for (let i = 0; i < proposal.steps.length; i++) {
    const step = proposal.steps[i];
    if (step.toolName !== 'swap_execute' || !step.cetusRoute) continue;
    const stepInput = step.input as {
      from?: unknown;
      to?: unknown;
      amount?: unknown;
      byAmountIn?: unknown;
    };
    if (
      typeof stepInput.from !== 'string' ||
      typeof stepInput.to !== 'string' ||
      typeof stepInput.amount !== 'number'
    ) {
      continue;
    }
    stashReads.push({
      toolUseId: `fastpath_${proposal.bundleId}_${i}_quote`,
      input: {
        from: stepInput.from,
        to: stepInput.to,
        amount: stepInput.amount,
        ...(typeof stepInput.byAmountIn === 'boolean'
          ? { byAmountIn: stepInput.byAmountIn }
          : {}),
      },
      result: { serializedRoute: step.cetusRoute },
      timestamp: proposal.validatedAt,
    });
  }
  const swapQuoteReads = [...historyReads, ...stashReads];

  return composeBundleFromToolResults({
    pendingWrites,
    tools: [...tools],
    readResults,
    swapQuoteReads,
    assistantContent: [],
    completedResults: [],
    turnIndex,
  });
}

/**
 * Try the fast path for the current chat turn. Returns null when:
 *   - sessionId or walletAddress is missing
 *   - the user's message is neither an affirmative confirm nor a
 *     plan-context-eligible reply (Phase 1.5) — UNLESS forceAdmit='chip'
 *     overrides the intent gates (Phase 2)
 *   - no fresh proposal is stashed for this session
 *   - the stash's wallet doesn't match the current request's wallet
 *
 * Admission has three paths (checked in order):
 *
 *   1. **Chip override** (Phase 2): caller passes `forceAdmit='chip'`.
 *      Skips intent checks entirely. Tag: `admitted_via=chip`.
 *      Session/stash/wallet checks still run (a chip click against an
 *      expired stash or wrong wallet should still skip cleanly).
 *
 *   2. **Strict regex** (`isAffirmativeConfirmReply`): "yes" / "Confirm" /
 *      "execute" / etc. Matches the 108 ms canonical happy path.
 *      Tag: `admitted_via=regex`.
 *
 *   3. **Plan-context override** (Phase 1.5): the regex missed, but the
 *      prior assistant turn is a multi-write Payment Intent plan AND
 *      the user's reply isn't clearly negative. Catches "do it bro" /
 *      "vamos" / voice transcripts / multilingual confirms that
 *      otherwise drop into LLM re-planning (which decomposes bundles —
 *      the 04:31 prod regression). Tag: `admitted_via=plan_context`.
 *
 * Each null path increments `audric.bundle.fast_path_skipped` with
 * a `reason` label. The successful path increments
 * `audric.bundle.fast_path_dispatched` with `step_count` and
 * `admitted_via` so dashboards can split by admission cause.
 */
export async function tryConsumeFastPathBundle(
  opts: FastPathConsumeOpts,
): Promise<FastPathHit | null> {
  if (!opts.sessionId) return recordSkip('no_session');
  if (!opts.walletAddress) return recordSkip('no_wallet');

  let admittedVia: AdmittedVia | null = null;
  if (opts.forceAdmit === 'chip') {
    // [Phase 2] Chip override. Skip ALL intent gates — chip is a 100%
    // signal. Session/stash/wallet gates below still apply (chip click
    // against expired stash → no_stash; against wrong wallet →
    // wallet_mismatch).
    admittedVia = 'chip';
  } else if (isAffirmativeConfirmReply(opts.trimmedMessage)) {
    admittedVia = 'regex';
  } else if (opts.history && opts.history.length > 0) {
    // [Phase 1.5] Plan-context override. Only fire when the prior
    // assistant turn was a multi-write plan — never on a cold session.
    if (looksLikeNegativeReply(opts.trimmedMessage)) {
      // User clearly isn't confirming (typed "no" / "wait" / "cancel"
      // / "actually let me reconsider" / etc). Skip — let the LLM
      // handle the modification/cancellation. Plan-context promotion
      // (Phase 1) ensures Sonnet gets the turn instead of Haiku-lean.
      return recordSkip('negative_reply');
    }
    if (detectPriorPlanContext(opts.history).matched) {
      admittedVia = 'plan_context';
    }
  }
  if (admittedVia === null) {
    // Either the regex missed AND no history was provided (legacy
    // call site, would-be `not_affirmative` under Phase 1), OR the
    // history shows no multi-write plan. Distinguishing the two
    // makes dashboards easier to read — `not_affirmative` should be
    // close-to-zero post-Phase-1.5; `no_plan_context` is the steady
    // state for every non-confirm chat message.
    if (opts.history && opts.history.length > 0) {
      return recordSkip('no_plan_context');
    }
    return recordSkip('not_affirmative');
  }

  const proposal = await consumeBundleProposal(opts.sessionId);
  if (!proposal) return recordSkip('no_stash');

  if (proposal.walletAddress !== opts.walletAddress) {
    return recordSkip('wallet_mismatch');
  }

  const action = buildPendingActionFromProposal(
    proposal,
    opts.turnIndex,
    opts.tools,
    opts.history,
  );

  getTelemetrySink().counter('audric.bundle.fast_path_dispatched', {
    step_count: String(proposal.steps.length),
    admitted_via: admittedVia,
  });

  return {
    action,
    proposal,
    // [SPEC 14 Phase 2 — May 3 prod soak] The synthetic ack must be
    // temporally unambiguous. By the time the resume route's narration
    // LLM sees this message, the bundle has already settled on-chain
    // and `postWriteRefresh` has injected balance_check + savings_info
    // tool_use blocks INTO this same assistant message. A
    // forward-looking "Compiling..." text confuses the model because
    // it sees no record of the actual write tool_use blocks (those
    // went through the sponsored-tx flow, not the engine) and tries
    // to detective-work whether the writes happened. The 2,361-char
    // tangent on the first prod confirm was that exact failure mode.
    //
    // Past-tense + "verifying" framing tells the LLM: "The writes
    // executed. The post-write refresh reads you're about to see are
    // VERIFICATION reads. Now narrate the outcome." Empirically saves
    // ~2,000 thinking chars per fast-path narration turn.
    syntheticAssistantText:
      `Confirmed. Compiled into one atomic Payment Intent (${proposal.steps.length} writes) — verifying on-chain outcome.`,
    admittedVia,
  };
}

export const __testOnly__ = {
  buildPendingActionFromProposal,
  findContributingReadsFromHistory,
  findSwapQuoteReadsFromHistory,
};
