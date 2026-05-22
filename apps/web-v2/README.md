# @audric/web-v2

> **Status:** Production. Serves `audric.ai` chat + Pay receipts + Store profile + Settings.

The v0.7c+ Next.js app powering [audric.ai](https://audric.ai) — AI agent for money on Sui. Forked from [`vercel/ai-chatbot`](https://github.com/vercel/ai-chatbot) at SHA `107a43a` and progressively re-shelled (auth, persistence, model routing, render surface) across v0.7c Phases 0–6. v0.7c FULLY SHIPPED; currently executing v0.7e (Tier C migration + `apps/web` archive).

## Routes (production surface)

| Route | Purpose |
|---|---|
| `/chat` | Live chat composer (the home surface). zkLogin-gated. |
| `/chat/[id]` | Persistent chat resume (private + public, ownership-gated 404). Shipped in v0.7e H2 (S.247). |
| `/share/[id]` | Public read-only viewer for shared chats (visibility=public required). |
| `/[username]` | Public Audric Store profile (`audric.ai/funkii`). |
| `/pay/[slug]` | Public payment-link receipt. |
| `/settings/*` | Passport (identity), Safety (HF + permissions), Memory (recall surface), Contacts (Path A: deleted in v0.7e H3). |
| `/auth/*` | zkLogin sign-in (Google OAuth → Sui address derivation). |
| `/api/chat`, `/api/chat/[id]`, `/api/history`, `/api/vote` | Chat persistence + history + RLHF vote (v0.7e H2). |
| `/api/transactions/{prepare,execute}` | Sponsored-tx flow (Enoki gas + zkLogin signing). |
| `/api/{portfolio,payments,analytics/*,internal/*}` | Canonical read surfaces (consumed by `@t2000/engine` tools — see v0.7c Phase 6 Session 4.5 / S.191). |
| `/api/auth/*` | zkLogin session + JWT verify. |

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack, Cache Components, Partial Prerender for `/chat/[id]` + `/share/[id]`).
- **Runtime:** Node + Vercel serverless (with `waitUntil` for fire-and-forget DB writes — see S.249 lesson).
- **AI:** AI SDK v6 (`useChat` + `DefaultChatTransport`) + `@t2000/engine` agent (`Experimental_Agent.stream()`), routed through Vercel AI Gateway.
- **Auth:** zkLogin via `@mysten/dapp-kit` (Google OAuth → Sui address). `x-zklogin-jwt` header rides on `authFetch` calls; RSCs read it via the JWT helper.
- **DB:** Prisma 7 → Neon Postgres (shared schema with `apps/web` at `apps/web/prisma/schema.prisma`).
- **Memory:** `@mysten-incubation/memwal` (vector recall + SEAL encryption + Walrus blob storage). See [`memory-injection-architecture.mdc`](../../../t2000/.cursor/rules/memory-injection-architecture.mdc).
- **Wallet / chain:** `@mysten/sui` v2.x, `@mysten/payment-kit`, Enoki sponsorship.
- **Styling:** Tailwind v4 + Agentic Design System tokens (white/black, New York Large + Geist + Departure Mono).
- **Lint:** Biome via `ultracite` (template choice, retained per v0.7c Phase 5 D-17).

## Local dev

```bash
pnpm install                              # from audric repo root
pnpm --filter @audric/web-v2 dev          # http://localhost:3001
```

Env vars validated at boot via Zod schema in [`lib/env.ts`](./lib/env.ts) — see [`env-validation-gate.mdc`](../../../t2000/.cursor/rules/env-validation-gate.mdc). Server won't boot if any required var is missing/empty.

zkLogin requires the OAuth redirect URI to be registered with Google for localhost — see `audric/HANDOFF_NEXT_AGENT.md` for the local-dev workaround (most founder smoke happens against preview/prod deploys, not localhost).

## Scripts

| Script | What it does |
|---|---|
| `dev` | Next dev server on port 3001 (Turbopack) |
| `build` | Production build |
| `start` | Production server on port 3001 |
| `lint` / `check` | `ultracite check` (Biome via wrapper) |
| `fix` | `ultracite fix` (auto-fix Biome issues) |
| `typecheck` | `tsc --noEmit` |
| `test:e2e` | Playwright |
| `smoke:b1-b1a`, `smoke:s213` | One-shot smoke scripts (history; see `scripts/`) |

## Where to look next

| Topic | File |
|---|---|
| What v0.7c shipped | [`spec/active/BENEFITS_SPEC_v07c.md`](../../../t2000/spec/active/BENEFITS_SPEC_v07c.md) — all 6 phases closed |
| What v0.7e is shipping now | [`spec/active/BENEFITS_SPEC_v07e.md`](../../../t2000/spec/active/BENEFITS_SPEC_v07e.md) — Phase 1A SHIPPED, Phase 2 next |
| What's open (operational) | [`audric/HANDOFF_NEXT_AGENT.md`](../../HANDOFF_NEXT_AGENT.md) — Open backlog table + sequencing |
| Execution history | `audric-build-tracker.md` (founder-local) — S.249 is the latest entry |
| Engine wiring | `@t2000/engine` package — see `packages/engine/src/v2/` |
| Sponsored-tx flow | [`audric-transaction-flow.mdc`](../../.cursor/rules/audric-transaction-flow.mdc) |
| Memory layer | [`memory-injection-architecture.mdc`](../../../t2000/.cursor/rules/memory-injection-architecture.mdc) |

## Upstream attribution

The chatbot template's original README is preserved alongside this file as [`README.template.md`](./README.template.md) for credits + upstream cross-references. The v0.7c fork rationale (why we vendored vs imported, why we kept Biome over ESLint, the chatbot template SHA pin) lives in `BENEFITS_SPEC_v07c.md` §"Phase 1 Day 1b".
