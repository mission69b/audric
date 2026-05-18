/**
 * TelemetryIntegration — AI-SDK-native turn telemetry for web-v2.
 *
 * [Day 2e / D-15] Refactored to consume AI SDK `TextStreamPart` chunks
 * directly (instead of legacy `EngineEvent` shape). Day 2c++ Batch 1
 * (S.172) shipped this as an EngineEvent observer when the route still
 * went through `AISDKEngine.submitMessage`; Day 2e switches the route
 * to `Experimental_Agent.stream({...})` per D-15 lock, so the collector
 * follows the data shape one layer up.
 *
 * What's preserved (G4 acceptance pin):
 *   - The 41-field `TurnMetrics` row shape (7 LIVE + 34 DORMANT fields)
 *     identical to Day 2b/2c++. NeonDB schema unchanged.
 *   - Cost rates inlined (12 LoC) — AI Gateway dashboard remains the
 *     authoritative spend ledger; these rates only drive Prisma rows.
 *   - Per-tool latency tracking via toolCallId-keyed timer map.
 *   - First-text-delta / first-visible-progress / wall-time / cache
 *     hit / cache savings computations all unchanged.
 *
 * What changed vs Day 2c++:
 *   - `observe(EngineEvent)` → `observeChunk(TextStreamPart)`.
 *   - `text_delta` event handler → `text-delta` chunk handler (same body).
 *   - `tool_start` event handler → `tool-call` chunk handler (chunk fires
 *     at LLM tool-call emission time; equivalent latency anchor).
 *   - `tool_result` event handler → `tool-result` + `tool-error` chunk
 *     handlers (AI SDK splits success vs error into two chunk types).
 *   - `usage` event handler → `finish` chunk handler (AI SDK emits ONE
 *     `finish` chunk per turn with cumulative `totalUsage`; matches the
 *     engine's prior cumulative-usage emission shape).
 *
 * Architectural lock taken at Day 2c++ Batch 1 (preserved through Day 2e):
 * new telemetry instrumentation goes via this integration (no custom
 * event listeners). See spec/active/BENEFITS_SPEC_v07c.md §"Phase 2 Day
 * 2c++" + S.172 + S.174.
 */

import type { TextStreamPart, ToolSet } from "ai";

const FINAL_TEXT_CHARS_PER_TOKEN = 4;

// Per-million-token Anthropic rates (late 2025). Cache reads bill at
// 0.1× input, cache writes at 1.25× input. Source: Anthropic pricing
// page; replaces the deleted `lib/audric/cost-rates.ts` (51 LoC) by
// inlining the same 12-line lookup directly in the integration.
const RATE_PER_MILLION: Record<
  "haiku" | "sonnet" | "opus",
  { input: number; output: number }
> = {
  haiku: { input: 1, output: 5 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

function ratesForModel(model: string) {
  const family = model.includes("haiku")
    ? "haiku"
    : model.includes("opus")
      ? "opus"
      : "sonnet";
  const r = RATE_PER_MILLION[family];
  const input = r.input / 1_000_000;
  return {
    input,
    output: r.output / 1_000_000,
    cacheRead: input * 0.1,
    cacheWrite: input * 1.25,
  };
}

export interface ToolMetric {
  latencyMs: number;
  name: string;
  resultDeduped?: boolean;
  resultSizeChars: number;
  returnedRefinement?: boolean;
  toolUseId: string;
  wasEarlyDispatched?: boolean;
  wasTruncated?: boolean;
}

/**
 * Generic chunk shape — the `TextStreamPart<TOOLS>` union is wide and
 * varies by the host's `ToolSet` generic. We type the observer with
 * `TextStreamPart<ToolSet>` (the broadest variant) so any host's
 * agent.stream() chunks slot in without type acrobatics.
 */
type AnyChunk = TextStreamPart<ToolSet>;

export class TelemetryIntegration {
  private readonly startTime = Date.now();
  private firstTextDeltaTime: number | null = null;
  private firstVisibleProgressTime: number | null = null;
  private readonly toolStartTimes = new Map<string, number>();
  private readonly toolMetrics: ToolMetric[] = [];
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;
  private cacheWriteTokens = 0;
  private finalTextChars = 0;
  private interrupted = false;

  observeChunk(chunk: AnyChunk): void {
    switch (chunk.type) {
      case "text-delta": {
        if (typeof chunk.text !== "string" || chunk.text.length === 0) {
          break;
        }
        if (this.firstTextDeltaTime === null) {
          this.firstTextDeltaTime = Date.now();
        }
        if (this.firstVisibleProgressTime === null) {
          this.firstVisibleProgressTime = Date.now();
        }
        this.finalTextChars += chunk.text.length;
        break;
      }
      case "tool-call": {
        // [Day 2e] AI SDK fires `tool-call` when the LLM finishes
        // emitting the tool call (after input JSON has fully streamed).
        // Same latency anchor as the prior `tool_start` EngineEvent.
        this.toolStartTimes.set(chunk.toolCallId, Date.now());
        if (this.firstVisibleProgressTime === null) {
          this.firstVisibleProgressTime = Date.now();
        }
        break;
      }
      case "tool-result": {
        const start = this.toolStartTimes.get(chunk.toolCallId) ?? Date.now();
        this.toolMetrics.push({
          toolUseId: chunk.toolCallId,
          name: chunk.toolName,
          latencyMs: Date.now() - start,
          resultSizeChars: safeStringify(chunk.output).length,
        });
        break;
      }
      case "tool-error": {
        const start = this.toolStartTimes.get(chunk.toolCallId) ?? Date.now();
        this.toolMetrics.push({
          toolUseId: chunk.toolCallId,
          name: chunk.toolName,
          latencyMs: Date.now() - start,
          resultSizeChars: safeStringify(chunk.error).length,
        });
        break;
      }
      case "finish": {
        // [Day 2e] AI SDK emits ONE `finish` chunk per turn with the
        // cumulative `totalUsage` across all steps. Set (not accumulate)
        // — matches the engine's prior bridge behavior at event-bridge.ts
        // L137 ("the bridge surfaces only the cumulative finish.totalUsage
        // to keep the legacy EngineEvent.usage contract unchanged").
        const u = chunk.totalUsage;
        this.inputTokens = u.inputTokens ?? 0;
        this.outputTokens = u.outputTokens ?? 0;
        this.cacheReadTokens = u.inputTokenDetails?.cacheReadTokens ?? 0;
        this.cacheWriteTokens = u.inputTokenDetails?.cacheWriteTokens ?? 0;
        break;
      }
      default:
        break;
    }
  }

  markInterrupted(): void {
    this.interrupted = true;
  }

  build(context: {
    sessionId: string;
    userId: string;
    turnIndex: number;
    effortLevel: string;
    modelUsed: string;
    contextTokensStart: number;
    sessionSpendUsd: number;
    synthetic?: boolean;
    turnPhase?: "initial" | "resume";
  }) {
    const wallTimeMs = Date.now() - this.startTime;
    const rates = ratesForModel(context.modelUsed);
    const estimatedCostUsd =
      this.inputTokens * rates.input +
      this.outputTokens * rates.output +
      this.cacheReadTokens * rates.cacheRead +
      this.cacheWriteTokens * rates.cacheWrite;
    const cacheSavingsUsd = Math.max(
      0,
      this.cacheReadTokens * (rates.input - rates.cacheRead)
    );
    const ttfvpMs =
      this.firstVisibleProgressTime === null
        ? null
        : this.firstVisibleProgressTime - this.startTime;
    const firstTokenMs =
      this.firstTextDeltaTime === null
        ? wallTimeMs
        : this.firstTextDeltaTime - this.startTime;

    // 41-field shape per Day 2b (c') decision (LIVE 7 + DORMANT 34 + DEAD 0).
    return {
      // ─── LIVE (7) — read by audric code from Postgres today ───
      sessionId: context.sessionId,
      userId: context.userId,
      turnIndex: context.turnIndex,
      attemptId: null,
      pendingActionOutcome: null,
      synthetic: context.synthetic ?? false,
      // `id` + `createdAt` server-managed by Prisma — omitted; stamped per @default.

      // ─── DORMANT (34) — emitted for shape parity, dropped at Phase 6+ ───
      effortLevel: context.effortLevel,
      modelUsed: context.modelUsed,
      wallTimeMs,
      firstTokenMs,
      toolsCalled: this.toolMetrics,
      guardsFired: [],
      compactionTriggered: false,
      contextTokensStart: context.contextTokensStart,
      cacheHit: this.cacheReadTokens > 0,
      cacheReadTokens: this.cacheReadTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      estimatedCostUsd,
      pendingActionYielded: false,
      aciRefinements: 0,
      sessionSpendUsd: context.sessionSpendUsd,
      mutableToolDedupes: 0,
      writeToolDurationMs: null,
      cacheSavingsUsd,
      turnPhase: context.turnPhase ?? "initial",
      harnessShape: null,
      thinkingBlockCount: 0,
      todoUpdateCount: 0,
      ttfvpMs,
      finalTextTokens: Math.ceil(
        this.finalTextChars / FINAL_TEXT_CHARS_PER_TOKEN
      ),
      evalSummaryEmittedCount: 0,
      evalSummaryViolationsCount: 0,
      pendingInputSeenOnLegacy: false,
      toolProgressEventCount: 0,
      interruptedMessageCount: this.interrupted ? 1 : 0,
      // JSONB columns — caller wraps in `Prisma.DbNull` for proper SQL NULL.
      cetusRoute: null,
      streamResumeOutcome: null,
    };
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}
