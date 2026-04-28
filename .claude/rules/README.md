# .claude/rules

Supplementary per-subsystem notes for Claude Code sessions. The primary source of truth is `CLAUDE.md` at the repo root — it is auto-loaded every turn. Files here are *not* auto-loaded; treat them as reference material to read when working in the named subsystem.

| File | Scope |
|------|-------|
| `engine-integration.md` | How audric/web consumes `@t2000/engine` — context assembly, factory wiring, store injection. |
| `prisma.md` | Prisma + NeonDB conventions — singleton, generated client location, migrations. |
| `runbooks.md` | Operational runbooks (zkLogin env parity, portfolio regression matrix, cron debugging). |
| `internal-api.md` | The `/api/internal/*` contract with t2000 cron — auth, idempotency, sharding. |

## Relationship to `.cursor/rules/`

`.cursor/rules/*.mdc` are Cursor IDE rules (auto-applied by Cursor via its MDC convention). They cover cross-cutting concerns (env-validation-gate, audric-canonical-portfolio, write-tool-pending-action, audric-pay-flow, audric-finance-flow, etc.). Do **not** duplicate those rules here — if a rule needs to be universal, put it in `CLAUDE.md`.

## Policy

- Keep each file short and subsystem-scoped.
- Avoid hard-coded counts (model totals, route totals, version numbers) — they go stale quickly. Reference authoritative sources (`prisma/schema.prisma`, `CLAUDE.md`) instead.
- If content here duplicates `CLAUDE.md`, delete it here.
- If content here would benefit Cursor too, promote it to `.cursor/rules/`.
