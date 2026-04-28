# Internal API (`/api/internal/*`)

Endpoints called server-to-server by t2000 ECS cron. Read alongside `.cursor/rules/cron-job-architecture.mdc`.

## Auth — required

```typescript
import { assertInternal } from '@/lib/internal-auth';

export async function POST(req: Request) {
  assertInternal(req);  // 401 if x-internal-key header doesn't match T2000_INTERNAL_KEY
  // ... do the work
}
```

Never skip this. Internal endpoints are public HTTPS endpoints; the auth gate is the only security boundary.

## Sharding contract

Endpoints accept optional `{ shard, total }` body params. When present, filter users by hash:

```typescript
const body = await req.json().catch(() => ({}));
const { shard, total } = body as { shard?: number; total?: number };

const users = await prisma.user.findMany({
  where: shard != null && total != null
    ? { /* hash-based shard filter — id is cuid */ }
    : undefined,
});
```

Default shard count from t2000 cron is **8**.

## Response shape — uniform

```typescript
return Response.json({ created, skipped, errors, total });
```

t2000 cron logs the aggregate counts. Don't deviate.

## Idempotency

Cron WILL retry. Use `prisma.X.upsert(...)`, never `create(...)`.

## Endpoints

| Route | Domain | Cron schedule (UTC) |
|---|---|---|
| `/api/internal/financial-context-snapshot` | UserFinancialContext | 02:30 |
| `/api/internal/portfolio-snapshot` | PortfolioSnapshot | 02:00 |
| `/api/internal/memory-extraction` | UserMemory | 03:15 |
| `/api/internal/profile-inference` | UserFinancialProfile | 03:00 |
| `/api/internal/chain-memory` | ChainFact | 04:00 |
| `/api/internal/payments` | Payment status updates | On-event |
| `/api/internal/health-factor` + `hf-alert` | Resend email when HF < 1.2 | Real-time indexer hook |

## Adding a new endpoint

1. `assertInternal(req)` first line.
2. Accept optional `{ shard, total }`.
3. Make it idempotent (upsert).
4. Return `{ created, skipped, errors, total }`.
5. Add the t2000 cron job (see `t2000/.cursor/rules/cron-job-architecture.mdc`).
6. Update `.cursor/rules/cron-job-architecture.mdc` AND `.cursor/rules/prisma-models-overview.mdc`.
