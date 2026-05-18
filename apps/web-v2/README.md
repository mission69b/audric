# @audric/web-v2

> **Status:** Phase 1 Day 1b — template vendored. Not deployed anywhere yet.

Side-by-side fork target for [`spec/active/BENEFITS_SPEC_v07c.md`](../../../t2000/spec/active/BENEFITS_SPEC_v07c.md) per **D-1 (b)**. Replacing `apps/web` in-place would put the working main at risk during a 3–6 week migration. Standing up `apps/web-v2` in parallel keeps `audric.ai` shipping while the new chat shell takes shape; cutover at Phase 6 is a single DNS change.

## What lives here today (Phase 1 Day 1b)

Vendored copy of [`vercel/ai-chatbot`](https://github.com/vercel/ai-chatbot) at SHA **`107a43a`** (2026-04-17), adapted for the audric monorepo. See [`HANDOFF_NEXT_AGENT.md`](../../HANDOFF_NEXT_AGENT.md) for the full pin rationale + version-compatibility audit.

The template ships its own `README.template.md` (preserved alongside this file for credits + upstream docs).

### What we adapted vs upstream `107a43a`

| Surface | Upstream | web-v2 | Reason |
|---|---|---|---|
| `package.json` name | `chatbot` (v3.1.0) | `@audric/web-v2` (v0.1.0-phase1-day1b) | Monorepo convention; semver reset for the fork |
| `package.json` `packageManager` | `pnpm@10.32.1` | _removed_ | Audric root pins `pnpm@10.6.2` |
| `dev` / `start` | port 3000 | `--port 3001` | Side-by-side with `apps/web` on 3000 per D-1 |
| `build` | `tsx lib/db/migrate && next build` | `next build` | Drizzle migrations stripped — D-9 (a) lock swaps to Prisma in Phase 2; until then we don't run migrations |
| `ai` | `6.0.116` | `^6.0.182` | Matches `@t2000/engine` |
| `@vercel/blob` | `^0.24.1` | `^2.3.3` | Matches `apps/web` |
| `@vercel/analytics` | `^1.3.1` | `^1.6.1` | Matches `apps/web` |
| `@types/react*` | `^18` | `^19` | Audric pattern; React 19 deps already pinned |
| `tsx` | `^4.19.1` | `^4.21.0` | Matches `apps/web` |
| `pnpm-lock.yaml` | per-package | _removed_ | Audric uses a root lockfile |
| `vercel.json` | `{ framework: nextjs }` | _removed_ | Audric monorepo's root `vercel.json` covers all apps |
| `vercel-template.json` | "Deploy to Vercel" button manifest | _removed_ | Not relevant inside a monorepo |
| `README.md` | upstream | this file (upstream preserved as `README.template.md`) | Phase-aware status doc |

### What we kept verbatim (vendored as-is)

- `app/(auth)/` — to be deleted in Day 1c per D-7 (b) "vendor first, then strip"
- `app/(chat)/` — the chat surface; gets rewired to `@t2000/engine` in Phase 2
- `lib/db/` (Drizzle) — stays until Phase 2 Prisma swap per D-9
- `lib/ai/` — the model-routing surface; gets replaced with `gateway('anthropic/...')` per D-6 in Phase 2
- `components/` — UI primitives + chat components; renderer migration sweeps these in Phase 5
- `hooks/` — `use-active-chat`, `use-messages`, etc. — kept as-is; integrate alongside audric hooks in Phase 2
- `biome.jsonc` + Biome via `ultracite` — template's lint stack; staying for now. Aligning to audric's ESLint is a separate Phase 5 decision (low priority — Biome is fine).

## What lands next

### Day 1c (Auth eviction + zkLogin)

1. Delete `app/(auth)/` (template's next-auth login/register flow).
2. Remove `next-auth` + `bcrypt-ts` from `package.json`.
3. Strip `<SessionProvider>` from `app/layout.tsx`; replace with audric's zkLogin provider (sourced from `apps/web/lib/zklogin/`).
4. Strip `next-auth` imports from `app/(chat)/` callsites (chat actions, sidebar user nav, etc.).
5. Replace template's `auth.config.ts` middleware with audric's existing `middleware.ts` (zkLogin gate).
6. Smoke: sign-in flow round-trips end-to-end; chat page is reachable when signed-in; no `next-auth` import residue.

Reference: [`MystenLabs/MemWal/apps/chatbot`](https://github.com/MystenLabs/MemWal/tree/dev/apps/chatbot) (sister project that did the same zkLogin + chatbot template integration per **S-2**).

### Phase 2 (next phase, ~4 days)

Replace template chat backend with `@t2000/engine.submitMessage()` + `streamText` + AI Gateway routing. See SPEC Phase 2.

## Boot status (Phase 1 Day 1b)

The template is freshly vendored and **not yet wired to env vars or a database** — booting it will likely throw at any route that touches `next-auth`'s `auth()` (needs `AUTH_SECRET`) or the database (needs `POSTGRES_URL`). For Day 1b acceptance we verify only that `pnpm install` resolves cleanly and `next dev` STARTS LISTENING on port 3001 (server boot, not route render). Day 1c addresses the auth env; Phase 2 addresses the chat backend.

```bash
pnpm install                                 # from audric repo root
pnpm --filter @audric/web-v2 dev             # http://localhost:3001
```

## Why "v0.7c"

The SPEC is the source of truth.

- Status / D-locks → [`BENEFITS_SPEC_v07c.md`](../../../t2000/spec/active/BENEFITS_SPEC_v07c.md)
- Template pin rationale → [`HANDOFF_NEXT_AGENT.md`](../../HANDOFF_NEXT_AGENT.md)
- Build tracker row → `audric-build-tracker.md` row 7t
- Engine side (completed, the predecessor) → `BENEFITS_SPEC_v07a.md`
