-- [SPEC 8 v0.5.1 B3.6 / Layer 6 telemetry] Per-turn harness instrumentation.
--
-- 10 new columns on `TurnMetrics` so the existing Q5/Q6 dashboard query
-- can segment by harness shape, catch terseness regressions, watch the
-- LLM honour the `<eval_summary>` rule, and detect interruption + flag
-- regressions BEFORE the rollout dial moves to 50%/100%.
--
-- Storage cost: ~50 bytes/turn at 500 turns/day = ~9 KB/year. Negligible.
--
-- All columns nullable or defaulted because (a) pre-migration rows have
-- no values and (b) read-only / lean / pre-resume rows naturally have
-- zero values for shape-specific counters. No backfill needed —
-- dashboards filter `WHERE harnessShape IS NOT NULL` for the new
-- segmentation.
--
-- Indexed: `harnessShape` (frequent dashboard segmentation predicate).

ALTER TABLE "TurnMetrics"
  -- One-shot per-turn shape declared by the engine `harness_shape` event.
  -- 'lean' | 'standard' | 'rich' | 'max'. Null on rows that pre-date the
  -- engine event (legacy v1.4.x and earlier).
  ADD COLUMN "harnessShape"              TEXT,
  -- Number of `thinking_done` events emitted this turn. Caps at the
  -- per-shape soft limit (3 / 5 / 8). Watching for "lean turns emit > 0"
  -- as a regression signal; "rich emits 0 thinking" as a low-quality signal.
  ADD COLUMN "thinkingBlockCount"        INTEGER NOT NULL DEFAULT 0,
  -- Number of `update_todo` tool calls this turn. Each call is one event
  -- (the engine emits a side-channel `todo_update` per `update_todo` call).
  -- Watching `lean` for any non-zero value (regression).
  ADD COLUMN "todoUpdateCount"           INTEGER NOT NULL DEFAULT 0,
  -- Time To First Visible Progress: ms from turn start to the first
  -- non-control event that the host renders (thinking_delta, tool_start,
  -- todo_update, text_delta — whichever lands first). The new harness
  -- aims to keep p50 ttfvp ≤ 1500ms; SPEC 8 v0.5.1 B3.7 rollback gate
  -- triggers if p50 exceeds that.
  ADD COLUMN "ttfvpMs"                   INTEGER,
  -- Output tokens for `text_delta` events only (no thinking, no tool I/O).
  -- Used as the canonical "terseness" signal — final-text discipline says
  -- 1-2 sentences. Approximated as ceil(charCount / 4) on the host
  -- (matches @t2000/engine `estimateTokens` constant). p50 baseline is
  -- ~120 tokens; +50% triggers the SPEC 8 v0.5.1 B3.7 rollback gate.
  ADD COLUMN "finalTextTokens"           INTEGER NOT NULL DEFAULT 0,
  -- Raw count of `<eval_summary>` markers parsed by the engine this turn
  -- (`thinking_done.summaryMode === true`). v0.5 G9: count without
  -- quality judgment; the dashboard derives `appropriatelyEmittedRate`
  -- from `WHERE harnessShape >= 'standard'`. Should be 0 on lean turns;
  -- typically 1 on standard+ write-recommendation turns.
  ADD COLUMN "evalSummaryEmittedCount"   INTEGER NOT NULL DEFAULT 0,
  -- Counter increments when `evalSummaryEmittedCount > 1` for the same
  -- turn (LLM emitted multiple markers — broken UX, two trust cards).
  -- Should be ~zero in steady state. Spike means the prompt rule
  -- "AT MOST ONE per turn" stopped working — investigate before it
  -- becomes a quality regression.
  ADD COLUMN "evalSummaryViolationsCount" INTEGER NOT NULL DEFAULT 0,
  -- Counter for `pending_input` events arriving on a session pinned to
  -- the legacy harness (SPEC 8 v0.5 D2 forward-compat). Should ALWAYS
  -- be false in production — engine v1.5.0 doesn't emit this event.
  -- Non-zero rows mean a legacy session received a SPEC 9 v0.1.2
  -- emission; flag rollout pinning broke somewhere.
  ADD COLUMN "pendingInputSeenOnLegacy"  BOOLEAN NOT NULL DEFAULT false,
  -- Number of `tool_progress` events emitted by long-running tools
  -- (Cetus swap_execute, protocol_deep_dive, portfolio_analysis). The
  -- spec target is for ≥80% of swap_execute turns to emit at least one
  -- progress event once the wiring lands.
  ADD COLUMN "toolProgressEventCount"    INTEGER NOT NULL DEFAULT 0,
  -- 1 when this turn ended without a `turn_complete` and without a
  -- `pending_action` (server-side cleanliness flag — see SPEC 8 v0.5.1
  -- B3.4 Gap J / `chat/route.ts` `turnCompleteSeen`). Rollback gate
  -- triggers if interruption rate > 1% over a 24h window.
  ADD COLUMN "interruptedMessageCount"   INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "TurnMetrics_harnessShape_idx" ON "TurnMetrics" ("harnessShape");
