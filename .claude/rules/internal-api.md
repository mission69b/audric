# Internal API (`/api/internal/*`) — Post-v0.7d Phase 6 Block C

> ✅ **Updated 2026-05-21 (S.224).** The t2000 ECS cron retired in Block A/B/C of v0.7d Phase 6 (S.221 / S.222 / S.224). Almost every receiver route under `/api/internal/*` was deleted alongside it. Read alongside `.cursor/rules/cron-job-architecture.mdc` for the full migration story.

## What's left

Only ONE route. `POST /api/internal/payments` — the engine bridge for payment-link / invoice tools (`create_payment_link`, `list_payment_links`, `cancel_payment_link`, `create_invoice`, `list_invoices`, `cancel_invoice`). Engine calls it server-side via `x-internal-key` because it has no zkLogin JWT (server context, not browser).

Slated for elimination in v0.7e+ via function injection — see `HANDOFF_NEXT_AGENT.md` backlog `engine-fn-injection-refactor`. Until then, this is the canonical pattern for engine→audric server-to-server bridges.

## Auth — required

```typescript
import { validateInternalKey } from '@/lib/internal-auth';

export async function POST(req: Request) {
  const auth = validateInternalKey(req.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;
  // ... do the work
}
```

Never skip this. Internal endpoints are public HTTPS endpoints; the auth gate is the only security boundary.

## Endpoints (post-Block-C)

| Route | Domain | Caller |
|---|---|---|
| `/api/internal/payments` (POST/GET/PATCH) | `Payment` CRUD | Engine payment-link + invoice tools |

> **Deleted in v0.7d Phase 6 (S.221, S.222, S.224 — 2026-05-21):**
> - `/api/internal/memory-extraction`, `/api/internal/profile-inference`, `/api/internal/chain-memory` (S.221) — replaced by MemWal `analyze()` in `apps/web-v2/lib/audric/memwal-write-callback.ts`.
> - `/api/internal/portfolio-snapshot`, `/api/internal/financial-context-snapshot` (S.224) — replaced by Vercel cron at `/api/cron/*` with `CRON_SECRET` bearer auth.
> - `/api/internal/health-factor`, `/api/internal/notification-users`, `/api/internal/user-address`, `/api/internal/app-event` (S.224) — receivers of the now-retired t2000 ECS cron. Zero callers post-Block-C.

## Adding a new internal endpoint

**Stop. Don't.** Almost every new server-to-server need should be a function call inside the same Next.js process (the v0.7e+ pattern). If you genuinely need an HTTP boundary:

1. `validateInternalKey(req.headers.get('x-internal-key'))` first line.
2. Make it idempotent (upsert).
3. JSON-only response.
4. Update `cron-job-architecture.mdc` AND this rule + add an audit-finding note explaining why function injection wasn't viable.
