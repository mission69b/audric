/**
 * [v1.4 Item 4] HarnessMetrics — per-turn instrumentation collector.
 *
 * The collector is constructed once per chat-route invocation, populated
 * from streaming `EngineEvent`s, and read at turn close into a single
 * `TurnMetrics` row written fire-and-forget to NeonDB.
 *
 * Failures here MUST never block a chat response — every public method
 * is fail-soft, and the `build(...)` call cannot throw.
 */

import type { HarnessShape, TelemetrySink } from '@t2000/engine';
import { MUTABLE_TOOL_SET } from './engine-factory';
import { costRatesForModel } from './cost-rates';

/**
 * [SPEC 8 v0.5.1 B3.6 / Layer 6] `chars / 4` mirrors @t2000/engine's
 * `estimateTokens` helper (`packages/engine/src/context.ts:CHARS_PER_TOKEN`).
 * Keeping the constant aligned across both sides means terseness
 * regression analysis (`finalTextTokens`) is comparable to the engine's
 * own context budget math without an extra dependency.
 */
const FINAL_TEXT_CHARS_PER_TOKEN = 4;

export interface ToolMetric {
  /**
   * Engine-side tool-use id. Stored so we can flip the `resultDeduped`
   * flag when a follow-up `__deduped__` marker arrives in the same
   * turn referencing this row.
   */
  toolUseId: string;
  name: string;
  latencyMs: number;
  resultSizeChars: number;
  wasTruncated: boolean;
  /** [v1.4 Day 4] Set once early-dispatcher exposes this flag. */
  wasEarlyDispatched: boolean;
  /** [v1.4 Day 4] Set once microcompact dedup exposes this flag. */
  resultDeduped: boolean;
  returnedRefinement: boolean;
}

export interface GuardMetric {
  name: string;
  tier: 'safety' | 'financial' | 'ux';
  action: 'allow' | 'warn' | 'block';
  injectionAdded: boolean;
}

/**
 * Real GuardVerdict from `@t2000/engine` is `'pass' | 'hint' | 'warn' | 'block'`.
 *   pass/hint → allow (hint is non-blocking, model just sees a note)
 *   warn      → warn
 *   block     → block
 */
export function verdictToAction(
  verdict: 'pass' | 'hint' | 'warn' | 'block',
): GuardMetric['action'] {
  if (verdict === 'pass' || verdict === 'hint') return 'allow';
  if (verdict === 'warn') return 'warn';
  return 'block';
}

interface ToolResultMeta {
  wasTruncated: boolean;
  wasEarlyDispatched: boolean;
  resultDeduped: boolean;
  returnedRefinement: boolean;
}

export class TurnMetricsCollector {
  private readonly startTime = Date.now();
  private firstTextDeltaTime: number | null = null;
  private readonly toolStartTimes = new Map<string, number>();
  private readonly toolMetrics: ToolMetric[] = [];
  private readonly _guardsFired: GuardMetric[] = [];
  private _compactionTriggered = false;
  private _cacheHit = false;
  private _cacheReadTokens = 0;
  private _cacheWriteTokens = 0;
  private _inputTokens = 0;
  private _outputTokens = 0;
  private _pendingActionYielded = false;
  private _aciRefinements = 0;
  /**
   * [v1.4.2 — Day 3 / Spec Item 3] UUID stamped by the engine on the
   * `pending_action` event. Captured via `onPendingAction(attemptId)` and
   * persisted on the `TurnMetrics` row so the resume route can do a
   * single-row `updateMany where { attemptId }` instead of the ambiguous
   * `(sessionId, turnIndex)` pair. `null` for read-only turns and for the
   * legacy callers that haven't been wired yet (defensive — the typed
   * signature requires a string, but `onPendingAction` short-circuits
   * silently on falsy input rather than throwing).
   */
  private _pendingAttemptId: string | null = null;

  // ---------------------------------------------------------------------
  // [SPEC 8 v0.5.1 B3.6 / Layer 6] Per-turn harness telemetry state.
  // ---------------------------------------------------------------------

  /**
   * Shape pinned by the engine `harness_shape` event at turn start.
   * `null` until the event lands (for engines older than v1.5.0 that
   * never emit it, the row stores null and dashboards filter it out).
   */
  private _harnessShape: HarnessShape | null = null;

  /** Count of `thinking_done` events. Soft-capped per shape by the engine. */
  private _thinkingBlockCount = 0;

  /** Count of `update_todo` tool calls (one per `todo_update` event). */
  private _todoUpdateCount = 0;

  /** Count of `tool_progress` events from long-running tools. */
  private _toolProgressEventCount = 0;

  /** Count of `<eval_summary>` markers parsed (from `thinking_done.summaryMode`). */
  private _evalSummaryEmittedCount = 0;

  /** True when a `pending_input` event arrived under the legacy harness. */
  private _pendingInputSeenOnLegacy = false;

  /** True when the turn ended without a `turn_complete` and without a `pending_action`. */
  private _interrupted = false;

  /**
   * Time To First Visible Progress (TTFVP) — ms timestamp of the first
   * non-control event the host renders (`thinking_delta`, `tool_start`,
   * `todo_update`, `text_delta`, whichever first). Stays null when the
   * turn produces no renderable events (rare error path) — `build()`
   * surfaces null on the row in that case.
   */
  private _firstVisibleProgressTime: number | null = null;

  /**
   * Char count of all `text_delta` events. Converted to `finalTextTokens`
   * at `build()` time via `chars / FINAL_TEXT_CHARS_PER_TOKEN`. Excludes
   * thinking and tool I/O so we measure the user-facing terseness signal.
   */
  private _finalTextChars = 0;

  onFirstTextDelta(): void {
    if (this.firstTextDeltaTime === null) {
      this.firstTextDeltaTime = Date.now();
    }
    this.markVisibleProgress();
  }

  /**
   * [SPEC 8 v0.5.1 B3.6] Accumulate `text_delta` characters for the
   * `finalTextTokens` terseness signal. Called on every `text_delta`
   * event (not just the first one).
   */
  onTextDelta(text: string): void {
    if (typeof text === 'string' && text.length > 0) {
      this._finalTextChars += text.length;
    }
  }

  /**
   * [SPEC 8 v0.5.1 B3.6] Stamp the engine-declared shape for this turn.
   * Idempotent — the engine emits `harness_shape` exactly once at turn
   * start, but a defensive last-write-wins makes resume / replay safe.
   */
  onHarnessShape(shape: HarnessShape | undefined | null): void {
    if (!shape) return;
    this._harnessShape = shape;
  }

  /**
   * [SPEC 8 v0.5.1 B3.6] Increment the thinking-block counter and, when
   * the engine flagged the marker, the eval-summary emission counter.
   * `summaryMode === true` means the engine parsed an
   * `<eval_summary>...</eval_summary>` block from the buffered thinking
   * text — the host renders the structured rows as a "✦ HOW I EVALUATED
   * THIS" trust card.
   */
  onThinkingDone(opts?: { summaryMode?: boolean }): void {
    this._thinkingBlockCount++;
    if (opts?.summaryMode) this._evalSummaryEmittedCount++;
  }

  /**
   * [SPEC 8 v0.5.1 B3.6] Increment on every `thinking_delta` event so
   * we can stamp TTFVP from the very first thinking burst (typically
   * the earliest renderable signal in a write-recommendation turn).
   */
  onThinkingDelta(): void {
    this.markVisibleProgress();
  }

  /**
   * [SPEC 8 v0.5.1 B3.6] Each `update_todo` tool call surfaces as a
   * `todo_update` event on the side channel. Increment per event.
   */
  onTodoUpdate(): void {
    this._todoUpdateCount++;
    this.markVisibleProgress();
  }

  /**
   * [SPEC 8 v0.5.1 B3.6] Long-running tools opt into emitting
   * `tool_progress` events from inside their `call` implementation
   * (Cetus swap_execute, protocol_deep_dive, portfolio_analysis).
   */
  onToolProgress(): void {
    this._toolProgressEventCount++;
  }

  /**
   * [SPEC 8 v0.5.1 B3.6 / D2] Record `pending_input` arrival, flagged
   * with whether the active session is pinned to the legacy harness.
   * In production under engine v1.5.0 (which doesn't emit
   * `pending_input`), this should never fire — non-zero values mean
   * either the session-pinning broke or a SPEC 9 emission leaked into
   * a legacy session.
   */
  onPendingInput(harnessVersion: string | null | undefined): void {
    if (harnessVersion === 'legacy') {
      this._pendingInputSeenOnLegacy = true;
    }
  }

  /**
   * [SPEC 8 v0.5.1 B3.6 / Gap J] Server-side detected interruption —
   * called from the chat-route `finally` block when neither
   * `turn_complete` nor `pending_action` fired during the stream.
   */
  markInterrupted(): void {
    this._interrupted = true;
  }

  onToolStart(toolUseId: string): void {
    this.toolStartTimes.set(toolUseId, Date.now());
    this.markVisibleProgress();
  }

  /**
   * [SPEC 8 v0.5.1 B3.6] Stamp the first-visible-progress timestamp
   * exactly once per turn. Called by `onTextDelta`, `onThinkingDelta`,
   * `onToolStart`, `onTodoUpdate` — whichever fires first. The chat
   * route never calls this directly.
   */
  private markVisibleProgress(): void {
    if (this._firstVisibleProgressTime === null) {
      this._firstVisibleProgressTime = Date.now();
    }
  }

  onToolResult(
    toolUseId: string,
    toolName: string,
    result: unknown,
    meta: ToolResultMeta,
  ): void {
    const start = this.toolStartTimes.get(toolUseId) ?? Date.now();
    const resultStr = safeStringify(result);
    this.toolMetrics.push({
      toolUseId,
      name: toolName,
      latencyMs: Date.now() - start,
      resultSizeChars: resultStr.length,
      wasTruncated: meta.wasTruncated,
      wasEarlyDispatched: meta.wasEarlyDispatched,
      resultDeduped: meta.resultDeduped,
      returnedRefinement: meta.returnedRefinement,
    });
    if (meta.returnedRefinement) this._aciRefinements++;
  }

  onGuardFired(guard: GuardMetric): void {
    this._guardsFired.push(guard);
  }

  /**
   * [v1.4 Item 4] Flip `resultDeduped=true` on the previously recorded
   * `ToolMetric` row whose `toolUseId` matches the marker. The marker
   * is a synthetic `tool_result` event with `toolName === '__deduped__'`
   * emitted by `microcompact` — see `engine.ts` agent loop.
   *
   * Cross-turn: most dedup hits reference a tool-use from a *prior*
   * turn (already persisted in an earlier `TurnMetrics` row), so the
   * lookup is a deliberate no-op. Same-turn dedup hits in long
   * multi-step turns flip the flag in place.
   */
  markToolResultDeduped(toolUseId: string): void {
    const target = this.toolMetrics.find((t) => t.toolUseId === toolUseId);
    if (target) target.resultDeduped = true;
  }

  onCompaction(): void {
    this._compactionTriggered = true;
  }

  /**
   * [v1.5.2] Token accumulation — fixes the "0% cache hit rate" measurement bug.
   *
   * The Anthropic provider emits TWO `usage` events per LLM call:
   *   1. `message_start` carries `inputTokens` (system + history) +
   *      `cacheReadTokens` + `cacheWriteTokens` from `msg.usage`.
   *   2. `message_delta` carries an output-token delta with
   *      `inputTokens: 0` and no cache fields.
   *
   * The previous implementation OVERWROTE every field on each call, so
   * the second event clobbered `_inputTokens` and the cache counters
   * back to 0. Result: every TurnMetrics row stored
   * `inputTokens=0, cacheReadTokens=0, cacheWriteTokens=0`, making
   * `cacheHit` impossible to detect even when the prompt cache was
   * actually working. Multi-step turns (multiple LLM calls per Audric
   * turn) had the same problem on the input/cache side and only
   * captured the LAST call's counters.
   *
   * Now: accumulate input/output across all usage events; pick the
   * MAX cache values (which arrive with the first usage event of each
   * LLM call — multi-call turns sum naturally because the second
   * call's cache_read_input_tokens is additive in Anthropic's API).
   */
  onUsage(event: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  }): void {
    this._inputTokens += event.inputTokens;
    this._outputTokens += event.outputTokens;
    if (event.cacheReadTokens && event.cacheReadTokens > 0) {
      this._cacheReadTokens += event.cacheReadTokens;
    }
    if (event.cacheWriteTokens && event.cacheWriteTokens > 0) {
      this._cacheWriteTokens += event.cacheWriteTokens;
    }
    this._cacheHit = this._cacheReadTokens > 0;
  }

  /**
   * [v1.4.2 — Day 3 / Spec Item 3] Captures the `attemptId` from the
   * engine's `pending_action` event so it lands on the resulting
   * `TurnMetrics` row. The argument is required by the type but we
   * tolerate a missing one defensively — the collector has historically
   * never thrown from a callback and we don't want to change that
   * invariant for instrumentation. A null/empty id keeps the legacy
   * sessionId+turnIndex fallback path working in the resume route.
   */
  onPendingAction(attemptId?: string): void {
    this._pendingActionYielded = true;
    if (attemptId) this._pendingAttemptId = attemptId;
  }

  build(context: {
    sessionId: string;
    userId: string;
    turnIndex: number;
    effortLevel: string;
    modelUsed: string;
    contextTokensStart: number;
    estimatedCostUsd: number;
    sessionSpendUsd: number;
    /**
     * [v1.4.2 — Day 3] `true` when the turn was driven by a synthetic
     * pre-fetch intent rather than a user prompt. The remaining live
     * source is `engine-factory.ts:buildSyntheticPrefetch` (new-session
     * cold-start balance/savings preload). The chat route's
     * resumed-session pre-fetch (`RESUMED_SESSION_INTENTS`) was deleted
     * in v0.48 (bug 3); it never set this flag at the row level
     * regardless. Caller (chat-route) decides; collector just stamps.
     * Default (when omitted) is `false`.
     */
    synthetic?: boolean;
    /**
     * [v1.4.2 — Day 3] `'initial'` for the chat-route close, `'resume'`
     * for the resume-route close. Lets dashboards split first-turn
     * latency from post-confirmation tail latency.
     */
    turnPhase?: 'initial' | 'resume';
  }) {
    const wallTimeMs = Date.now() - this.startTime;
    // [v1.5.1] Drift counter for the `cacheable: false` invariant.
    // `MUTABLE_TOOL_SET` is the union of all post-write refresh targets;
    // engine v0.43.0+ marks every member `cacheable: false`, so
    // `resultDeduped` should NEVER be true for these tools. Any non-zero
    // count here = silent regression (someone added a mutable tool to
    // the refresh map without flagging it `cacheable: false`).
    const mutableToolDedupes = this.toolMetrics.reduce(
      (n, t) => (t.resultDeduped && MUTABLE_TOOL_SET.has(t.name) ? n + 1 : n),
      0,
    );
    // [v1.4.2 — Day 3] Cache savings — the USD we *didn't* pay because
    // Anthropic's prompt cache served the prefix at 0.1× the input rate.
    // Computed at build time (not on every onUsage event) so the model
    // rate lookup happens once per turn. Hard-floored at 0 in case a
    // future rate regression makes cacheRead > input (would break
    // dashboards otherwise).
    const rates = costRatesForModel(context.modelUsed);
    const cacheSavingsUsd = Math.max(
      0,
      this._cacheReadTokens * (rates.input - rates.cacheRead),
    );
    // [SPEC 8 v0.5.1 B3.6 / G9] Violation = LLM emitted ≥2 markers in
    // the same turn. Should be ~zero in steady state — the system prompt
    // explicitly says "AT MOST ONE per turn". A non-zero value here means
    // the prompt rule stopped working and two trust cards rendered.
    const evalSummaryViolationsCount =
      this._evalSummaryEmittedCount > 1
        ? this._evalSummaryEmittedCount - 1
        : 0;
    // [SPEC 8 v0.5.1 B3.6] TTFVP — null when the turn produced no
    // renderable events (rare error path before any tool/text/thinking
    // ever yielded). Dashboards filter this case out of latency p50s.
    const ttfvpMs =
      this._firstVisibleProgressTime !== null
        ? this._firstVisibleProgressTime - this.startTime
        : null;
    return {
      ...context,
      wallTimeMs,
      firstTokenMs:
        this.firstTextDeltaTime !== null
          ? this.firstTextDeltaTime - this.startTime
          : wallTimeMs,
      toolsCalled: this.toolMetrics,
      guardsFired: this._guardsFired,
      compactionTriggered: this._compactionTriggered,
      cacheHit: this._cacheHit,
      cacheReadTokens: this._cacheReadTokens,
      cacheWriteTokens: this._cacheWriteTokens,
      inputTokens: this._inputTokens,
      outputTokens: this._outputTokens,
      pendingActionYielded: this._pendingActionYielded,
      pendingActionOutcome: this._pendingActionYielded ? 'pending' : null,
      aciRefinements: this._aciRefinements,
      mutableToolDedupes,
      // [v1.4.2 — Day 3 / Spec Item 3] New TurnMetrics columns.
      attemptId: this._pendingAttemptId,
      synthetic: context.synthetic ?? false,
      cacheSavingsUsd,
      turnPhase: context.turnPhase ?? 'initial',
      // [SPEC 8 v0.5.1 B3.6 / Layer 6] Per-turn harness telemetry.
      harnessShape: this._harnessShape,
      thinkingBlockCount: this._thinkingBlockCount,
      todoUpdateCount: this._todoUpdateCount,
      ttfvpMs,
      finalTextTokens: Math.ceil(this._finalTextChars / FINAL_TEXT_CHARS_PER_TOKEN),
      evalSummaryEmittedCount: this._evalSummaryEmittedCount,
      evalSummaryViolationsCount,
      pendingInputSeenOnLegacy: this._pendingInputSeenOnLegacy,
      toolProgressEventCount: this._toolProgressEventCount,
      interruptedMessageCount: this._interrupted ? 1 : 0,
    };
  }
}

/**
 * [SPEC 8 v0.5.1 B3.6 / Layer 6] Subset of `TurnMetricsCollector.build()`
 * output needed to emit transient harness counters. Typed loosely to
 * avoid coupling this helper to the full `TurnMetrics` row shape — the
 * chat route just spreads the built object straight in.
 */
export interface HarnessTelemetryInput {
  harnessShape: HarnessShape | null;
  modelUsed: string;
  thinkingBlockCount: number;
  todoUpdateCount: number;
  ttfvpMs: number | null;
  finalTextTokens: number;
  evalSummaryEmittedCount: number;
  evalSummaryViolationsCount: number;
  pendingInputSeenOnLegacy: boolean;
  toolProgressEventCount: number;
  interruptedMessageCount: number;
}

/**
 * [SPEC 8 v0.5.1 B3.6 / Layer 6] Emit per-turn `audric.harness.*`
 * counters/gauges via the engine's currently-installed
 * `VercelTelemetrySink` (set in `init-engine-stores.ts`). All emissions
 * are fire-and-forget — the sink swallows its own errors. Caller MUST
 * still wrap in try/catch defensively because telemetry failures must
 * never break a chat response.
 *
 * No new vendor here — strict adherence to `metrics-and-monitoring.mdc`.
 * The sink writes structured `console.log` lines that Vercel
 * Observability ingests automatically, plus `@vercel/analytics`
 * `track()` for the binary discrete events (interrupted, legacy-input).
 */
export function emitHarnessTelemetry(
  sink: TelemetrySink,
  metrics: HarnessTelemetryInput,
): void {
  const shape = metrics.harnessShape ?? 'legacy';
  const tags = { shape, model: metrics.modelUsed };

  // Counters that are always meaningful to record — even at zero — so
  // dashboard rates have a denominator (e.g. todo-emission rate per
  // shape needs both numerator and denominator counters).
  sink.counter('audric.harness.thinking_block_count', tags, metrics.thinkingBlockCount);
  sink.counter('audric.harness.todo_update_count', tags, metrics.todoUpdateCount);
  sink.counter(
    'audric.harness.tool_progress_event_count',
    tags,
    metrics.toolProgressEventCount,
  );
  sink.counter(
    'audric.harness.eval_summary_emitted_count',
    tags,
    metrics.evalSummaryEmittedCount,
  );

  // Discrete binary events — emit only when non-zero so the
  // analytics-track stream (which fires at value=1) stays signal-only.
  if (metrics.evalSummaryViolationsCount > 0) {
    sink.counter(
      'audric.harness.eval_summary_violations_count',
      tags,
      metrics.evalSummaryViolationsCount,
    );
  }
  if (metrics.pendingInputSeenOnLegacy) {
    sink.counter('audric.harness.pending_input_seen_on_legacy', tags);
  }
  if (metrics.interruptedMessageCount > 0) {
    sink.counter('audric.harness.interrupted_message_count', tags);
  }

  // Latency / size — histograms (Vercel Observability charts these as
  // p50/p95/p99 over the rolling window). Skip when null/zero so we
  // don't pollute the distribution with synthetic 0s on error paths.
  if (metrics.ttfvpMs !== null) {
    sink.histogram('audric.harness.ttfvp_ms', metrics.ttfvpMs, tags);
  }
  if (metrics.finalTextTokens > 0) {
    sink.histogram('audric.harness.final_text_tokens', metrics.finalTextTokens, tags);
  }
}

/**
 * Shared truncation marker check — kept aligned with the engine's
 * `Truncated —` marker emitted by `truncateToolResult` in the runtime.
 */
export function detectTruncation(result: unknown): boolean {
  const str = safeStringify(result);
  return str.includes('[Truncated') || str.includes('Truncated —');
}

/**
 * [v0.46.6] Card-rendering tools — keep aligned with the system prompt's
 * "Never duplicate card data" rule and with the registered renderers in
 * `components/engine/cards/*`. When ANY of these fired in a turn AND the
 * narration contains a markdown table, that's a v0.46.6 contract
 * violation: the model is dumping data the card already shows.
 */
// [v1.4 — Day 3] DefiLlama LLM tools deleted. `defillama_yield_pools`,
// `defillama_protocol_info`, `defillama_token_prices` removed; the new
// BlockVision-backed `token_prices` tool takes their place in the
// card-renderer registry. `protocol_deep_dive` (separate file, not in
// the deleted set) stays.
export const CARD_RENDERING_TOOLS = new Set<string>([
  'balance_check',
  'savings_info',
  'health_check',
  'transaction_history',
  'rates_info',
  'mpp_services',
  'list_payment_links',
  'list_invoices',
  'token_prices',
  'portfolio_analysis',
  'activity_summary',
  'yield_summary',
  'spending_analytics',
  'explain_tx',
  'swap_quote',
  'protocol_deep_dive',
]);

/**
 * Detect a markdown table in narration text.
 *
 * Strategy: match a header divider row of the form `|---|---|...|`
 * (with optional leading/trailing whitespace and pipes). Plain `|`
 * characters in prose don't trigger — we require at least two `---`
 * cells separated by pipes, which only appears in real tables.
 *
 * Examples that match:
 *   `| Asset | Save |\n|-------|------|\n| USDC | 4% |`
 *   `|---|---|---|`
 *
 * Examples that do NOT match:
 *   `Use \`|\` to separate fields`
 *   `Result: a | b | c`
 */
const MARKDOWN_TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m;

export function containsMarkdownTable(narration: string): boolean {
  if (!narration) return false;
  return MARKDOWN_TABLE_DIVIDER.test(narration);
}

export interface NarrationDumpReport {
  violated: boolean;
  cardTool?: string;
}

/**
 * Returns a report describing whether the model dumped a markdown table
 * in narration AFTER a card-rendering tool fired in the same turn. The
 * chat route wires this in fire-and-forget to console.warn so we can
 * track the regression rate without altering the response.
 *
 * Future: surface as a `narrationDumpedTable` boolean on TurnMetrics
 * once the next Prisma migration ships.
 */
export function detectNarrationTableDump(
  narration: string,
  toolNames: readonly string[],
): NarrationDumpReport {
  if (!containsMarkdownTable(narration)) return { violated: false };
  const cardTool = toolNames.find((n) => CARD_RENDERING_TOOLS.has(n));
  if (!cardTool) return { violated: false };
  return { violated: true, cardTool };
}

/**
 * Detect ACI refinement payloads.
 *
 * Two flavors of refinement are both valid signals that the tool told the
 * model to narrow its query:
 *
 *   1. Explicit `_refine` shape (used by `mpp_services` when called
 *      with no filter — the discovery path. Pre-Day-3 the same shape
 *      was emitted by `defillama_yield_pools`; that tool is gone now).
 *   2. Truncation markers (`_truncated: true` from `budgetToolResult`, or
 *      `summarizeOnTruncate`-emitted shapes like `_originalCount`). Used by
 *      `transaction_history` and any other tool whose response exceeds
 *      `maxResultSizeChars` — the result includes a "narrow your query"
 *      hint as part of the truncation note.
 *
 * Pre-0.47 this function only counted (1), making `transaction_history`
 * structurally show 0% refinement rate even when working correctly. The
 * baseline metrics queries depend on this count being honest.
 */
export function detectRefinement(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false;
  const obj = result as Record<string, unknown>;

  if ('_refine' in obj) return true;
  if ('refinementSuggested' in obj || 'refinementRequired' in obj) return true;
  if (obj._truncated === true) return true;
  if (typeof obj._originalCount === 'number') return true;

  const data = obj.data;
  if (data && typeof data === 'object') {
    const dataObj = data as Record<string, unknown>;
    if ('_refine' in dataObj) return true;
    if (dataObj._truncated === true) return true;
    if (typeof dataObj._originalCount === 'number') return true;
  }
  return false;
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}
