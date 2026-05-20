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

/**
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.2 / S.198 — 2026-05-20]
 * Structural shape of a guard fire — mirrors the engine's internal
 * `GuardMetric` type at `packages/engine/src/guards.ts` L63-68. Defined
 * locally (matches `apps/web/lib/engine/harness-metrics.ts` L92) because
 * the engine's `GuardMetric` is not re-exported from `@t2000/engine`'s
 * index; structural compatibility is sufficient for the
 * `onGuardFired` callback signature.
 */
export interface GuardMetric {
  action: "allow" | "warn" | "block";
  injectionAdded: boolean;
  name: string;
  tier: "safety" | "financial" | "ux";
}

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
  // [Phase 3 Day 3a / S.175] HITL correlation state. AI SDK emits a
  // `tool-approval-request` chunk when a confirm-tier tool pauses; the
  // chunk's `approvalId` is the correlation id the host persists on
  // `TurnMetrics` for the canonical "find this row again when the
  // approval resolves" pattern (`updateMany({where: {attemptId}})`).
  // Per agent-harness-spec.mdc §Item 3 + §Item 3a, attemptId === approvalId
  // by construction — we treat the AI SDK approvalId AS the engine's
  // attemptId for the v0.7c rewrite (the engine no longer emits its own
  // pending_action events under AI SDK orchestration).
  //
  // NOTE: approvalId is NOT equal to toolCallId. AI SDK generates a
  // fresh UUID via `generateId()` for the approval and pairs it with the
  // toolCallId in a Map server-side. We persist `approvalId` here, NOT
  // `toolCallId`.
  private pendingApprovalId: string | null = null;
  private pendingActionYielded = false;
  // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.2 / S.198 — 2026-05-20]
  // GuardMetric rows are pushed here by the engine's `onGuardFired` hook
  // (wired via `buildInternalContext({ onGuardFired })`). One entry per
  // guard fire — same shape as `apps/web/lib/engine/harness-metrics.ts`
  // L344 (`onGuardFired` method). Used in `build()` to populate the
  // `guardsFired` column on the TurnMetrics row.
  private readonly _guardsFired: GuardMetric[] = [];

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
      case "tool-approval-request": {
        // [Phase 3 Day 3a / S.175] AI SDK pauses the loop on a confirm-
        // tier tool. Persist the approvalId so `TurnMetrics.attemptId`
        // carries the correlation id the future resume turn can use to
        // `updateMany` the row. Multiple approvals per turn are possible
        // in theory; we keep the LAST one (matches engine's prior
        // pending_action emit pattern — the legacy `attemptId` was
        // overwritten on every yield within a turn).
        this.pendingApprovalId = chunk.approvalId;
        this.pendingActionYielded = true;
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

  /**
   * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.2 / S.198 — 2026-05-20]
   * Engine hook — invoked once per guard fire from inside the engine's
   * `runGuardsForTool` pipeline (see `packages/engine/src/v2/guard-
   * runner.ts` L104). Wired host-side via
   * `buildInternalContext({ onGuardFired: (g) => collector.onGuardFired(g) })`.
   *
   * Mirrors `apps/web/lib/engine/harness-metrics.ts` L344.
   */
  onGuardFired(guard: GuardMetric): void {
    this._guardsFired.push(guard);
  }

  build(context: {
    sessionId: string;
    userId: string;
    turnIndex: number;
    effortLevel: string;
    /**
     * [Phase 6.5 C.2] Host-computed harness shape via
     * `harnessShapeForEffort(effortLevel)`. Replaces the hardcoded
     * `null` shipped pre-C.2 so dashboards segmented by shape stay alive
     * after the chat-flip.
     */
    harnessShape?: string | null;
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
      // [Phase 3 Day 3a / S.175] Stamp the AI SDK `approvalId` (== the
      // engine's `attemptId` per agent-harness-spec.mdc §Item 3a) so
      // the resume turn — or a future audric/web `/api/engine/resume`
      // back-port — can `updateMany({where: {attemptId}})`.
      attemptId: this.pendingApprovalId,
      // The outcome is resolved on the NEXT turn (when the host sees
      // the approved tool-output-available / denied tool-output-denied
      // in the request body). Phase 3 leaves this `null` on Turn 1;
      // Phase 4 wires the cross-turn updateMany.
      pendingActionOutcome: null,
      synthetic: context.synthetic ?? false,
      // `id` + `createdAt` server-managed by Prisma — omitted; stamped per @default.

      // ─── DORMANT (34) — emitted for shape parity, dropped at Phase 6+ ───
      effortLevel: context.effortLevel,
      modelUsed: context.modelUsed,
      wallTimeMs,
      firstTokenMs,
      toolsCalled: this.toolMetrics,
      guardsFired: this._guardsFired,
      compactionTriggered: false,
      contextTokensStart: context.contextTokensStart,
      cacheHit: this.cacheReadTokens > 0,
      cacheReadTokens: this.cacheReadTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      estimatedCostUsd,
      pendingActionYielded: this.pendingActionYielded,
      aciRefinements: 0,
      sessionSpendUsd: context.sessionSpendUsd,
      mutableToolDedupes: 0,
      writeToolDurationMs: null,
      cacheSavingsUsd,
      turnPhase: context.turnPhase ?? "initial",
      harnessShape: context.harnessShape ?? null,
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
