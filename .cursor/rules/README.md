# .cursor/rules

Cursor IDE rules, auto-applied via the MDC convention (`description`, `globs`,
`alwaysApply` front-matter). These are cross-cutting engineering constraints for
**Audric v3** (`apps/web-v3`, the live app).

## Always-applied (every task)

| File | What it covers |
|------|---------|
| `goal-driven-execution.mdc` | Verifiable goals, multi-step plans (Karpathy) |
| `coding-discipline.mdc` | Think before coding, simplicity first, surgical changes (Karpathy) |
| `env-validation-gate.mdc` | Every env var goes through `lib/env.ts` Zod schema |
| `financial-amounts.mdc` | Always floor display amounts, never round up (USDC/USDsui sends) |

## History

The legacy **web-v2** rules (engine harness, canonical-portfolio/getPortfolio,
composeTx + Sponsor, 6-layer safeguards, DeFi/USDC-only saves, Prisma models,
pending_action HITL, Audric Finance/Pay flows, Geist Design System, cron/metrics,
zkLogin v2 flow) were removed 2026-06-20 — they described the frozen `apps/web-v2`
app, which v3 does not use (v3 = AI SDK over `@t2000/sdk`, Drizzle, client-signed
zkLogin, no engine/DeFi). Recover any from git history if web-v2 ever needs them.

## Relationship to `CLAUDE.md`

`CLAUDE.md` (repo root) is the primary spec auto-loaded every turn. If a rule
needs to apply universally, prefer `CLAUDE.md` and link the `.mdc` from there.
