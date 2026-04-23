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

import { MUTABLE_TOOL_SET } from './engine-factory';

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

  onFirstTextDelta(): void {
    if (this.firstTextDeltaTime === null) {
      this.firstTextDeltaTime = Date.now();
    }
  }

  onToolStart(toolUseId: string): void {
    this.toolStartTimes.set(toolUseId, Date.now());
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

  onPendingAction(): void {
    this._pendingActionYielded = true;
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
    };
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
 * Detect ACI refinement payloads. v1.4 tools (`defillama_yield_pools`,
 * `transaction_history`, `mpp_services`) return a `_refine` shape under
 * `data` when the input is too broad.
 */
export function detectRefinement(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false;
  const obj = result as Record<string, unknown>;
  if ('_refine' in obj) return true;
  if ('refinementSuggested' in obj || 'refinementRequired' in obj) return true;
  const data = obj.data;
  if (data && typeof data === 'object' && '_refine' in (data as object)) return true;
  return false;
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}
