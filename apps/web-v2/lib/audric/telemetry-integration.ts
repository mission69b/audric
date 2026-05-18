/**
 * TelemetryIntegration — AI-SDK-native turn telemetry for web-v2.
 *
 * Replaces the 246 LoC `MinimalTurnMetricsCollector` + 51 LoC
 * `cost-rates.ts` shipped on Day 2b (S.169). Built per the
 * BENEFITS_SPEC v0.7c Day 2c++ Batch 1 simplification — listens on
 * the engine's `EngineEvent` stream (the engine's
 * `experimental_telemetry` consumer) and produces the canonical
 * 41-field `TurnMetrics` row shape on `build()`.
 *
 * What changed vs the Day 2b collector:
 *   - Cost rates inlined (12 LoC) → `cost-rates.ts` deleted; AI Gateway
 *     dashboard is the authoritative spend ledger.
 *   - Long file-header preserved as a 1-line link to this module's
 *     entry in `audric-build-tracker.md`.
 *   - Same `observe(EngineEvent) → build(context)` API the route uses.
 *
 * Architectural lock taken at Day 2c++ Batch 1: new telemetry
 * instrumentation goes via this integration (no custom event
 * listeners). See spec/active/BENEFITS_SPEC_v07c.md §"Phase 2 Day
 * 2c++ — Cross-codebase managed-service migration matrix" + S.172.
 *
 * Row shape contract: the 41-field shape per Day 2b (c') decision is
 * preserved verbatim. 7 LIVE fields (read by audric/web from
 * Postgres today) + 34 DORMANT (warehouse parity, dropped at Phase
 * 6+ schema-simplification SPEC) + 0 DEAD.
 */

import type { EngineEvent } from "@t2000/engine";

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

  observe(ev: EngineEvent): void {
    switch (ev.type) {
      case "text_delta": {
        if (typeof ev.text !== "string" || ev.text.length === 0) {
          break;
        }
        if (this.firstTextDeltaTime === null) {
          this.firstTextDeltaTime = Date.now();
        }
        if (this.firstVisibleProgressTime === null) {
          this.firstVisibleProgressTime = Date.now();
        }
        this.finalTextChars += ev.text.length;
        break;
      }
      case "tool_start": {
        this.toolStartTimes.set(ev.toolUseId, Date.now());
        if (this.firstVisibleProgressTime === null) {
          this.firstVisibleProgressTime = Date.now();
        }
        break;
      }
      case "tool_result": {
        const start = this.toolStartTimes.get(ev.toolUseId) ?? Date.now();
        this.toolMetrics.push({
          toolUseId: ev.toolUseId,
          name: ev.toolName,
          latencyMs: Date.now() - start,
          resultSizeChars: safeStringify(ev.result).length,
          wasEarlyDispatched: ev.wasEarlyDispatched,
          resultDeduped: ev.resultDeduped,
        });
        break;
      }
      case "usage": {
        this.inputTokens += ev.inputTokens;
        this.outputTokens += ev.outputTokens;
        if (ev.cacheReadTokens && ev.cacheReadTokens > 0) {
          this.cacheReadTokens += ev.cacheReadTokens;
        }
        if (ev.cacheWriteTokens && ev.cacheWriteTokens > 0) {
          this.cacheWriteTokens += ev.cacheWriteTokens;
        }
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
