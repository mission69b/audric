# Prisma + NeonDB Conventions (apps/web)

Read alongside `.cursor/rules/prisma-models-overview.mdc`.

## Conventions

- **Schema:** `apps/web/prisma/schema.prisma`
- **Generated client:** `apps/web/lib/generated/prisma` (custom output — DO NOT change)
- **Singleton:** `apps/web/lib/prisma.ts` — always import from here, never `new PrismaClient()`
- **Provider:** PostgreSQL (NeonDB)
- **Migrations:** `pnpm --filter audric-web prisma migrate dev --name <descriptive-name>`

## Migration workflow

```bash
# 1. Edit schema.prisma
# 2. Generate migration + apply locally:
pnpm --filter audric-web prisma migrate dev --name add_xyz_field

# 3. Verify generated client compiles:
pnpm --filter audric-web prisma generate
pnpm --filter audric-web typecheck

# 4. After merge: Vercel runs `prisma migrate deploy` automatically (build step)
```

## Where writes live (per domain)

| Domain | Write site |
|---|---|
| User identity | `app/api/user/*` |
| Conversation | `app/api/engine/chat/route.ts`, `app/api/engine/resume/route.ts` |
| Telemetry | `lib/engine/harness-metrics.ts` |
| Cron snapshots | `app/api/internal/*` |
| Pay flows | `app/api/payments/*` |
| Engine tool writes | `lib/engine/{advice-tool,contact-tools}.ts` |

If you find yourself reaching for `prisma.X.create` somewhere new, ask if an existing write site can absorb it. See `.cursor/rules/prisma-models-overview.mdc` for the full catalog.

## Index discipline

Every column you'll filter on needs `@@index`. Postgres without indexes scales badly. Pattern in this codebase: index on `(userId, createdAt)`, `(sessionId)`, `(suiAddress)`, `(emailVerified, timezoneOffset)`.

## Connection pooling

NeonDB connection pooler URL is required for serverless functions. The `DATABASE_URL` env var should already point at the pooler endpoint. Do not switch to the direct connection without resizing for serverless concurrency.

## What to avoid

- Direct `new PrismaClient()` — always use the singleton from `lib/prisma.ts`.
- `prisma.X.findMany({})` without `take` — unbounded reads on growing tables (Payment, ConversationLog) will timeout.
- `await prisma.X.create(...)` on the response critical path — fire-and-forget with `.catch()` for telemetry writes.
- Editing `lib/generated/prisma/*` files — regenerated every `prisma generate`.
