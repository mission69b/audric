-- [SPEC 20.2 / D-1 (a)] Add `cetusRoute` to TurnMetrics so resume can
-- rehydrate the pending_action.cetusRoute when reconstructing a stalled
-- swap_execute. Json-typed; null when the turn isn't a swap_execute or
-- when the engine is pre-v1.25.0 (legacy fallback path).
ALTER TABLE "TurnMetrics" ADD COLUMN "cetusRoute" JSONB;
