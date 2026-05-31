# .cursor/rules

Cursor IDE rules, auto-applied by Cursor via its MDC convention (`description`, `globs`, `alwaysApply` front-matter). Each `.mdc` file describes cross-cutting engineering constraints that should apply regardless of which file you're editing.

## Always-applied (every task)

| File | What it covers |
|------|---------|
| `goal-driven-execution.mdc` | Verifiable goals, multi-step plans (Karpathy) |
| `coding-discipline.mdc` | Think before coding, simplicity first, surgical changes (Karpathy) |
| `env-validation-gate.mdc` | Every env var goes through `lib/env.ts` Zod schema |
| `audric-canonical-portfolio.mdc` | All wallet/positions/pricing reads go through `getPortfolio` |
| `safeguards-defense-in-depth.mdc` | The 6 layers between user intent and on-chain action |
| `financial-amounts.mdc` | Always floor display amounts, never round up |
| `usdc-only-saves.mdc` | Saves/borrows are USDC-only |
| `design-system.mdc` | Audric Design System tokens, semantic fonts, dark/light theming |

## Glob-scoped (apply when editing matching files)

| File | Scope |
|------|---------|
| `audric-transaction-flow.mdc` | `apps/web-v2/**/*.{ts,tsx}` — sponsored tx vs SDK direct, attemptId resume |
| `write-tool-pending-action.mdc` | `apps/web-v2/app/chat/audric-chat-client.tsx`, `app/api/chat/**`, `app/api/transactions/**`, `components/audric/**` — pending_action protocol |
| `web-v2-chat-route-architecture.mdc` | `app/api/chat/route.ts`, `lib/audric/**` — chat route phase map + AI SDK v6 conventions + HITL resume protocol + Vercel AI Gateway |
| `audric-context-assembly.mdc` | `lib/audric/system-prompt.ts`, `lib/audric/financial-context.ts`, `lib/audric/memwal-*.ts`, `lib/audric/moat-context.ts` — content builders that feed each system-prompt layer (companion to `t2000/memory-injection-architecture.mdc`) |
| `zklogin-passport-flow.mdc` | `lib/zklogin.ts`, `app/auth/**`, `app/api/user/**` — Passport flow + ephemeral keys |
| `prisma-models-overview.mdc` | `prisma/**`, `lib/prisma.ts`, `app/api/**` — 13 models, write sites |
| `audric-pay-flow.mdc` | `app/api/payments/**`, `app/pay/**`, `components/**Pay*.tsx`, `components/**Receive*.tsx` — Audric Pay |
| `audric-finance-flow.mdc` | `components/audric/cards/**`, `lib/portfolio.ts` — save/borrow/swap/charts |
| `cron-job-architecture.mdc` | `app/api/cron/**`, `lib/jobs/**` — 5 web-v2 crons + auth contract |
| `metrics-and-monitoring.mdc` | `app/api/chat/route.ts`, `lib/audric/telemetry-integration.ts` — TurnMetrics + SessionUsage write sites (inline post-S.255) |

## Relationship to `CLAUDE.md` and `.claude/rules/`

- `CLAUDE.md` (repo root) is the primary spec for Claude Code sessions, auto-loaded every turn.
- `.claude/rules/*.md` holds per-subsystem notes (engine integration, prisma, runbooks, internal API) — not auto-loaded; reference material.
- Files here are the IDE-layer rules auto-applied by Cursor.

If a rule needs to apply in both Cursor and Claude Code, prefer putting it in `CLAUDE.md` and linking to the `.mdc` from there (the root `CLAUDE.md § Key Documents` section does this).

## Cross-repo references

Many of these rules link to t2000-side rules (e.g. `t2000/.cursor/rules/agent-harness-spec.mdc`, `t2000/.cursor/rules/blockvision-resilience.mdc`). Read them when editing engine-adjacent code in audric/web.
