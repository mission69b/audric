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
| `audric-transaction-flow.mdc` | `apps/web/**/*.{ts,tsx}` — sponsored tx vs SDK direct, attemptId resume |
| `write-tool-pending-action.mdc` | `apps/web/app/page.tsx`, `app/api/engine/**`, `app/api/transactions/**`, `components/engine/cards/**` — pending_action protocol |
| `engine-context-assembly.mdc` | `apps/web/lib/engine/**`, `app/api/engine/**` — silent context layers |
| `zklogin-passport-flow.mdc` | `lib/zklogin.ts`, `app/auth/**`, `app/api/user/**` — Passport flow + ephemeral keys |
| `prisma-models-overview.mdc` | `prisma/**`, `lib/prisma.ts`, `app/api/**`, `lib/engine/**` — 16 models, write sites |
| `audric-pay-flow.mdc` | `app/api/payments/**`, `app/pay/**`, `components/**Pay*.tsx`, `components/**Receive*.tsx` — Audric Pay |
| `audric-finance-flow.mdc` | `components/engine/cards/**`, `lib/portfolio.ts`, `lib/rates.ts` — save/borrow/swap/charts |
| `cron-job-architecture.mdc` | `app/api/internal/**`, `lib/internal-auth.ts` — t2000 cron contract |
| `metrics-and-monitoring.mdc` | `lib/engine/harness-metrics.ts`, `lib/engine/log-session-usage.ts`, `app/api/engine/**` |

## Relationship to `CLAUDE.md` and `.claude/rules/`

- `CLAUDE.md` (repo root) is the primary spec for Claude Code sessions, auto-loaded every turn.
- `.claude/rules/*.md` holds per-subsystem notes (engine integration, prisma, runbooks, internal API) — not auto-loaded; reference material.
- Files here are the IDE-layer rules auto-applied by Cursor.

If a rule needs to apply in both Cursor and Claude Code, prefer putting it in `CLAUDE.md` and linking to the `.mdc` from there (the root `CLAUDE.md § Key Documents` section does this).

## Cross-repo references

Many of these rules link to t2000-side rules (e.g. `t2000/.cursor/rules/agent-harness-spec.mdc`, `t2000/.cursor/rules/blockvision-resilience.mdc`). Read them when editing engine-adjacent code in audric/web.
