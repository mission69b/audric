# Prisma + NeonDB Conventions (apps/web-v2)

Read alongside `.cursor/rules/prisma-models-overview.mdc` (the 13-model catalog).

## Conventions

- **Schema:** `apps/web-v2/prisma/schema.prisma`
- **Generated client:** `apps/web-v2/lib/generated/prisma` (custom output — DO NOT change)
- **Singleton:** `apps/web-v2/lib/prisma.ts` — always import from here, never `new PrismaClient()`
- **Provider:** PostgreSQL (NeonDB)
- **Migrations:** `pnpm --filter @audric/web-v2 prisma migrate dev --name <descriptive-name>`

## Migration workflow

```bash
# 1. Edit schema.prisma
# 2. Generate migration + apply locally:
pnpm --filter @audric/web-v2 prisma migrate dev --name add_xyz_field

# 3. Verify generated client compiles:
pnpm --filter @audric/web-v2 prisma generate
pnpm --filter @audric/web-v2 typecheck

# 4. After merge: Vercel runs `prisma migrate deploy` automatically (build step)
```

## Where writes live (per domain)

| Domain | Write site |
|---|---|
| User identity | `app/api/identity/*` |
| Conversation (Chat/Message/Vote) | `app/api/chat/route.ts` (resume is inline in the same route) |
| Telemetry (TurnMetrics/SessionUsage) | `app/api/chat/route.ts` + `lib/audric/resume-outcome.ts` |
| Cron snapshots | `app/api/cron/*` |
| Pay flows | `app/api/payments/*` |

If you find yourself reaching for `prisma.X.create` somewhere new, ask if an existing write site can absorb it. See `.cursor/rules/prisma-models-overview.mdc` for the full catalog.

## Index discipline

Every column you'll filter on needs `@@index`. Postgres without indexes scales badly. Pattern in this codebase: index on `(userId, createdAt)`, `(sessionId)`, `(suiAddress)`, `(emailVerified, timezoneOffset)`.

## Connection pooling

NeonDB connection pooler URL is required for serverless functions. The `DATABASE_URL` env var should already point at the pooler endpoint. Do not switch to the direct connection without resizing for serverless concurrency.

## What to avoid

- Direct `new PrismaClient()` — always use the singleton from `lib/prisma.ts`.
- `prisma.X.findMany({})` without `take` — unbounded reads on growing tables (Payment, Message, TurnMetrics) will timeout.
- `await prisma.X.create(...)` on the response critical path — fire-and-forget with `.catch()` for telemetry writes.
- Editing `lib/generated/prisma/*` files — regenerated every `prisma generate`.
