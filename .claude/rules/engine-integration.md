# Engine Integration (apps/web)

How audric/web consumes `@t2000/engine`. Read alongside `.cursor/rules/engine-context-assembly.mdc` and `.cursor/rules/write-tool-pending-action.mdc`.

## Where the engine is wired

| File | Purpose |
|---|---|
| `lib/engine/engine-factory.ts` | `createEngine(opts)` — builds `QueryEngine` per request with the right tools, model, context |
| `lib/engine/engine-context.ts` | `buildFullDynamicContext(...)` — assembles silent context (profile, memory, advice, chain facts, financial_context) |
| `lib/engine/init-engine-stores.ts` | Side-effect — injects Upstash DeFi cache store into the engine globals |
| `lib/engine/harness-metrics.ts` | TurnMetrics writers (chat-time + resume) |
| `lib/engine/log-session-usage.ts` | SessionUsage writer at session end |
| `lib/engine/permission-tiers-client.ts` | Client-side preset (conservative/balanced/aggressive) — currently unused under zkLogin |
| `lib/engine/recipes.ts` | Skill recipe registry |
| `lib/engine/spec-consistency.ts` | Boot-time check that consumers route through canonical fetchers |

## The two routes

- `POST /api/engine/chat` — SSE stream. Builds engine, runs turn, emits `text_delta` / `thinking_delta` / `tool_start` / `tool_result` / `pending_action` / `canvas` / `turn_complete` / `usage` / `error`.
- `POST /api/engine/resume` — non-streaming. Receives `{ attemptId, txDigest, balanceChanges, modifiedInput }`, marks `TurnMetrics.updateMany({ where: { attemptId } })`, writes a NEW resume-turn TurnMetrics row, continues the conversation.

## Critical invariants

1. `init-engine-stores` MUST run before any engine read. Loaded by `instrumentation.ts` AND side-effect-imported by `lib/portfolio.ts` (belt-and-suspenders).
2. Every `pending_action` event carries `attemptId` (Spec 1). Persist it on `TurnMetrics` immediately.
3. Engine writes are `permissionLevel: 'confirm'` — never override to `'auto'` under zkLogin.
4. `<financial_context>` block is sourced from `UserFinancialContext` (refreshed by 02:30 UTC cron). Don't fetch on the chat critical path.

## Imports — copy from CLAUDE.md

The full import surface is in `CLAUDE.md` under "Engine imports." Don't re-discover; copy from there.

## Tests

- Engine harness tests live in `@t2000/engine` (run via `pnpm --filter @t2000/engine test`).
- Audric integration tests live in `apps/web/lib/engine/__tests__/` (run via `pnpm --filter audric-web test`).
