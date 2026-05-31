# Engine Integration (apps/web-v2)

How `apps/web-v2` consumes `@t2000/engine`. The detailed, current contract lives in
`.cursor/rules/web-v2-chat-route-architecture.mdc` and `.cursor/rules/audric-context-assembly.mdc` —
read those. This file is a short orientation pointer.

## The shape (post-v0.7e / web-v2)

- There is **one** chat route: `POST /api/chat` (`app/api/chat/route.ts`). It uses the AI SDK v6
  `Experimental_Agent` driving `@t2000/engine` tools. **HITL resume is inline** in this same route
  (AI SDK `addToolResult` / tool-approval round-trip keyed on `attemptId`/`approvalId`) — there is NO
  separate `/api/engine/chat` or `/api/engine/resume` route, and no `engine-factory.ts` /
  `init-engine-stores.ts` (those were archived with `apps/web` in S.253).
- Silent context is assembled per turn (system prompt + `<financial_context>` from `UserFinancialContext`
  + MemWal `<memory_recall>` + AdviceLog) — see `audric-context-assembly.mdc`.
- Telemetry (`TurnMetrics`, `SessionUsage`) is written inline from the chat route +
  `lib/audric/resume-outcome.ts`.

## Critical invariants

1. Every `pending_action` carries `attemptId` (Spec 1) — persist it on `TurnMetrics`, key resume on it.
2. Engine writes are `permissionLevel: 'confirm'` under zkLogin — every write taps to confirm. Never
   override to `'auto'`.
3. The `<financial_context>` block comes from the daily `UserFinancialContext` snapshot (02:30 UTC cron) —
   don't fetch it on the chat critical path.

## Tests

- Engine harness tests live in `@t2000/engine` (`pnpm --filter @t2000/engine test`).
- App tests: `pnpm --filter @audric/web-v2 test` (Vitest).
