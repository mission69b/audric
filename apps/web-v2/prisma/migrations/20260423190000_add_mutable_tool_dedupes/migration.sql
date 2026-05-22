-- [v1.5.1] Drift counter for the engine `Tool.cacheable: false` invariant.
--
-- Engine v0.43.0 introduced `cacheable: false` on tools whose results
-- depend on mutable on-chain state (balance_check, savings_info,
-- health_check, transaction_history). Microcompact MUST never dedupe
-- these tools — every call after a write reflects new state.
--
-- This counter aggregates, per turn, the number of tools that:
--   1. appear in `MUTABLE_TOOL_SET` (derived from POST_WRITE_REFRESH_MAP), AND
--   2. had `resultDeduped = true` in `toolsCalled`.
--
-- Should always be 0 in production. If non-zero, a new mutable tool was
-- added to the refresh map without flagging the corresponding engine
-- tool `cacheable: false`. Audit query:
--
--   SELECT id, "modelUsed", "mutableToolDedupes", "toolsCalled"
--   FROM "TurnMetrics"
--   WHERE "mutableToolDedupes" > 0
--   ORDER BY "createdAt" DESC;

ALTER TABLE "TurnMetrics"
  ADD COLUMN "mutableToolDedupes" INTEGER NOT NULL DEFAULT 0;
