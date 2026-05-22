-- [SPEC 9 v0.1.3 P9.3] Persistent cross-session goals — promoted from
-- turn-scoped `update_todo` items via the `persist: true` flag.
--
-- Distinct from `SavingsGoal` (structured monetary target with deadline +
-- emoji); a `Goal` row is the LLM's free-form persistent todo: "save $500
-- by month-end", "research wstETH yields", "remind me to repay borrow when
-- HF drops below 1.5". The agent reads open goals from the daily
-- `<financial_context>` block (top-5 by `updatedAt`, omitted entirely when
-- count = 0 per v0.1.3 R4) so it can reference them naturally across
-- sessions.
--
-- Mutation surface (per v0.1.3 R5): host-only.
--   - Insert / update content + status='in_progress' → engine `update_todo`
--     tool with `persist: true` flag (an existing tool extension, not a
--     new tool — keeps the surface clean per R5).
--   - Status → 'completed' → host API: POST /api/goals/complete
--   - Status → 'dismissed' → host API: POST /api/goals/dismiss
--
-- There is intentionally NO `dismiss_goal` engine tool — the LLM never
-- needs to mutate a goal it didn't itself promote, and surfacing a
-- dismissal tool would bloat the system prompt with ~50 tokens of
-- description for a flow only the host UI fires.
--
-- Index on `(userId, status)` is sized for the most common query shape:
-- `<OpenGoalsSidebar />` hydrates `WHERE userId = ? AND status = 'in_progress'`
-- on every dashboard render; `buildFinancialContextBlock()` runs the same
-- query (with `ORDER BY updatedAt DESC LIMIT 5`) on every chat turn.

CREATE TABLE "Goal" (
    "id"              TEXT      NOT NULL,
    "userId"          TEXT      NOT NULL,
    "content"         TEXT      NOT NULL,
    "status"          TEXT      NOT NULL DEFAULT 'in_progress',
    "sourceSessionId" TEXT      NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "completedAt"     TIMESTAMP(3),

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
