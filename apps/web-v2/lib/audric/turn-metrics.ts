/**
 * Minimal TurnMetrics adapter for web-v2 Day 2b.
 *
 * ──────────────────────────────────────────────────────────────────────
 * # Why this isn't the production collector
 *
 * `audric/web/lib/engine/harness-metrics.ts` is the canonical
 * `TurnMetricsCollector` — ~700 LoC with ~35 event hooks plus the
 * shape-building `build()` method. Cross-app importing it from web-v2
 * doesn't work cleanly because:
 *   1. It uses `@/lib/generated/prisma/client` (audric/web's `@/`
 *      path alias) which clashes with web-v2's own `@/` alias.
 *   2. It depends on `MUTABLE_TOOL_SET` from
 *      `audric/web/lib/engine/engine-factory.ts` — pulling that file
 *      in transitively drags ~1000 LoC of engine factory (MCP, model
 *      routing, financial-context seeding, etc.) just to access a
 *      one-line `Set<string>`.
 *
 * Day 2b only needs ~5 of the 35 collector hooks for a single
 * `balance_check` read-tool turn (no resume, no streams, no thinking,
 * no pending action, no guards, no todo). So this file is a minimal
 * adapter that captures only those hooks and produces the canonical
 * 41-field row shape with proper defaults for hooks Day 2b doesn't
 * wire.
 *
 * Phase 6 cutover collapses this adapter back into the audric/web
 * collector OR promotes the audric/web collector to a shared lib.
 *
 * ──────────────────────────────────────────────────────────────────────
 * # Field-shape contract (the (c') decision)
 *
 * Day 2b kickoff founder lock (2026-05-18 PM): **emit the full 41-field
 * shape** with explicit null/zero defaults for hooks Day 2b doesn't
 * wire (`harnessShape`, `cetusRoute`, `streamResumeOutcome`,
 * `pendingActionYielded`, `pendingInputSeenOnLegacy`, etc.). Rationale:
 *
 *   - G4 acceptance ("emits TurnMetrics row indistinguishable from
 *     production today") preserved verbatim.
 *   - Production's `TurnMetricsCollector.build()` already emits
 *     null/zero for un-fired hooks on a given turn — same pattern.
 *   - Warehouse + Metabase + ad-hoc NeonDB SQL queries (if any exist
 *     outside this repo) keep working unchanged.
 *   - The pre-Day-2b audit (run 2026-05-18 by `explore` subagent)
 *     found 34/41 fields are emitted-but-not-SQL-read inside audric/web
 *     today (dormant warehouse data). Dropping those columns is a
 *     legitimate Phase 6+ schema simplification, not Day 2b scope.
 *   - Vercel telemetry's `emitHarnessTelemetry` consumes the in-memory
 *     `built` object, NOT a Postgres read — observability stays intact
 *     regardless of whether we emit dormant fields.
 *
 * 7 fields are LIVE (read by audric code from Postgres today):
 *   `id`, `sessionId`, `turnIndex`, `attemptId`, `pendingActionOutcome`,
 *   `synthetic`, `createdAt`.
 *
 * 34 fields are DORMANT (written but not SQL-read inside audric):
 *   the rest. Emitted for warehouse/shape parity; dropped at Phase 6+.
 *
 * 0 fields are DEAD (no writer + no reader).
 *
 * ──────────────────────────────────────────────────────────────────────
 */

import type { EngineEvent } from "@t2000/engine";
import { costRatesForModel } from "./cost-rates";

const FINAL_TEXT_CHARS_PER_TOKEN = 4;

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

export class MinimalTurnMetricsCollector {
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
        const resultStr = safeStringify(ev.result);
        this.toolMetrics.push({
          toolUseId: ev.toolUseId,
          name: ev.toolName,
          latencyMs: Date.now() - start,
          resultSizeChars: resultStr.length,
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
    const rates = costRatesForModel(context.modelUsed);
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

    // ────────────────────────────────────────────────────────────────
    // Full 41-field shape per (c') decision. Defaults are intentional:
    // production's collector emits the same null/zero defaults for any
    // hook that didn't fire on a given turn. See file-top comment for
    // the full audit + rationale.
    // ────────────────────────────────────────────────────────────────
    return {
      // ─── LIVE (7 of 41) — read by audric code from Postgres today ───
      sessionId: context.sessionId,
      userId: context.userId,
      turnIndex: context.turnIndex,
      attemptId: null, // No pending action in Day 2b (read-only tool)
      pendingActionOutcome: null,
      synthetic: context.synthetic ?? false,
      // `id` + `createdAt` are server-managed by Prisma — omitted from
      // the create payload; Prisma stamps them per `@default(...)`.

      // ─── DORMANT (34 of 41) — emitted for shape parity, dropped at Phase 6+ ───
      effortLevel: context.effortLevel,
      modelUsed: context.modelUsed,
      wallTimeMs,
      firstTokenMs,
      toolsCalled: this.toolMetrics,
      guardsFired: [], // Day 2b doesn't wire guards
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
      writeToolDurationMs: null, // resume route owns this column
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
      // `cetusRoute` + `streamResumeOutcome` are JSONB columns. Prisma
      // distinguishes `null` from `Prisma.DbNull` for JSON fields; we
      // pass `Prisma.DbNull` so SQL stores actual NULL rather than the
      // JSON literal `null`. (The chat route imports `Prisma` and
      // wraps these values per the production convention.)
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
