# CLAUDE.md — Audric

> Loaded every turn. Highest-leverage config for any AI assistant working on this codebase.
> **Audric is a private, decentralized, multi-model AI — _truly yours_.** (NOT "conversational banking" — that was the retired v2.)

---

## What Audric is

Sign in with Google → a **non-custodial Sui wallet (zkLogin)** in seconds, no seed phrase. Chat with the best open + frontier models, do cited multi-step research, generate images, send USDC/USDsui gaslessly, and run paid live-data Recipes — **private by default** (zero data retention, encrypted/decentralized memory, non-custodial). Positioning line: **"Private, decentralized AI — truly yours."**

---

## Architecture

### Three brands, three repos
```
t2000 (separate)   → Infrastructure: CLI, SDK, MCP, gateway, contracts (@t2000/{sdk,cli,mcp})
audric (this repo) → Consumer product: audric.ai — private decentralized AI
suimpp (separate)  → Protocol: suimpp.dev, @suimpp/mpp
```

### This repo — work in `apps/web-v3` ONLY
```
audric/
├── apps/web-v3/   ← audric.ai (LIVE). Clean-fork of the Vercel AI chatbot template.
│   ├── app/(chat)/api/chat/route.ts  ← the nervous system: routing, tools, HITL resume, metering
│   ├── app/(chat)/settings/          ← privacy hub (memory toggle, forget-all, delete/purge)
│   ├── lib/ai/        ← models.ts, prompts.ts, providers.ts, intelligence/router.ts, tools/*
│   ├── lib/db/        ← Drizzle schema + queries (Neon Postgres)
│   ├── lib/credit/    ← tiers.ts (Free/Pro/Max) + Stripe billing
│   ├── lib/{audric-auth,zklogin,memwal,blob,env}.ts
│   └── components/chat/, components/ai-elements/
└── apps/web-v2/   ← LEGACY/FROZEN (legacy.audric.ai). Do NOT touch. The old engine/DeFi app.
```

> ⚠️ `apps/web-v2` is the frozen legacy app (engine + NAVI/DeFi + Prisma). All current work is `apps/web-v3`. Ignore web-v2 unless explicitly asked.

---

## Critical rules

1. **Work in `apps/web-v3`.** web-v2 is frozen.
2. **No `@t2000/engine`.** It was retired. web-v3 composes the **AI SDK 7** (`ai@7`, upgraded from v6 on 2026-06-25 — S.496) over the **Vercel AI Gateway** + `@t2000/sdk` directly. There is no engine, no `getDefaultTools`, no `AISDKEngine`. (v7 portable `reasoning` drives the Auto router; `@ai-sdk/otel` is registered in `instrumentation.ts`; `Experimental_Agent` is now an alias of `ToolLoopAgent`.)
3. **No DeFi.** No NAVI / save / borrow / lending / Prisma. The wallet does **send (gasless USDC/USDsui) · swap (Cetus, in SDK) · pay (x402 Recipes)**.
4. **Money writes are CLIENT-executed.** `send_transfer` / `run_recipe` have no server `execute` — the browser signs via zkLogin on tap-to-confirm. The server NEVER holds keys.
5. **Never read `process.env.X` directly.** Go through the typed `env` proxy (`lib/env.ts`, Zod gate validated at boot via `instrumentation.ts`). New var → add to schema + `runtimeEnv` first.
6. **Honesty / no overclaim.** **Confidential (GPU-TEE) mode IS live** (S.593 — composer toggle → `phala/*`, anchored + verifiable). Still "coming soon" (never say live): **end-to-end-sealed chats** (Seal), **Walrus E2E backup**, **Store**. Memory is "encrypted + decentralized (Walrus) + deletable" — NOT "end-to-end" or "you own it on-chain" (that's the Seal upgrade). Confidential mode is a pure in-TEE completion (no tools/web/memory — they'd leave the enclave). Every chat is ZDR; private files are never on a public URL.
7. **Single source of truth.** Derive model lists / plan features from their catalogs (`lib/ai/models.ts`, `lib/credit/tiers.ts`) — never hardcode. `EVERY_PLAN`/`COMING_SOON` in `tiers.ts` feed BOTH `/pricing` and the billing page.
8. **Lint = Biome/ultracite** (`pnpm exec biome check --write <files>`), NOT ESLint. Typecheck = `tsc --noEmit` (ignore stale `.next/types` errors after deleting a route → `rm -rf .next/types`).

---

## The AI stack

- **Models** (`lib/ai/models.ts`): `Auto` (router) + **Kimi K2.5** (free, default), **DeepSeek V3.2**, **Grok 4.1 Fast**, **GPT-OSS-120B**, **Claude Opus 4.8**, **GPT-5.5**. All via the Vercel AI Gateway, **ZDR by default**. Privacy ladder in the switcher: Anon → Private·ZDR → **Confidential·TEE (LIVE, S.593)** — the composer Confidential toggle routes the turn to a `phala/*` GPU-TEE model (via `getInferenceModel` → inference.phala.com), anchored on Sui + verifiable (`t2 verify` / verify.t2000.ai). Sealed/E2E remains the deferred top rung.
  - **Gemini 3 Pro was REMOVED (2026-06-21)** — flaky on multi-step/replayed tool turns ("empty parts" 400). Re-add tracked in the handoff backlog. (The separate `google/gemini-2.5-flash-image` "Nano Banana" model used for IMAGE EDITING is unaffected.)
- **Auto routing** (`lib/ai/intelligence/router.ts`): classifies each turn on DeepSeek (cheap, reliable `generateObject`) → picks model + reasoning effort + step budget by complexity. Entitlement-aware (free models always; premium only when funded). **Auto research → Kimi** (reliable + free + interleaved thinking; never Gemini).
- **Tools** (`lib/ai/tools/`): `web_search` (direct Perplexity API for titled sources when `PERPLEXITY_API_KEY` set, else keyless Gateway Sonar fallback), `createDocument`/`editDocument`/`updateDocument`/`requestSuggestions` (artifacts), `balance_check`, `transaction_history`, `resolve_suins`, `send_transfer` (client-executed, gasless), `run_recipe` (client-executed, x402 — **always runs on Kimi**), `save_memory` (MemWal, when memory ON).
- **Recipes** (`lib/recipes/catalog.ts`): `morning_brief`, `ticker_deep_dive`, `market_research`, `company_deep_dive` — paid per-run in USDC via x402. The `run_recipe` enum derives from the catalog.
- **Research**: a research-shaped turn injects a directive + 12-step budget → several VISIBLE `web_search` steps (Chain-of-Thought timeline) → cited synthesis. The agent is told today's date (request hints) and to trust fresh results over training.

---

## Privacy & data (the moat)

- **Zero data retention** on every chat (Gateway `zeroDataRetention: true`) — prompts/responses never stored or trained on.
- **Private storage** — chats + generated files are encrypted at rest and served only through authed routes, **never a public URL** (`lib/blob.ts`, `access:'private'`; Walrus+Seal is the post-launch decentralized swap).
- **Decentralized memory** — `@mysten-incubation/memwal`, encrypted on **Walrus**, opt-in + OFF by default. `memoryNamespace(address, epoch)`; "Forget all" bumps `user.memoryEpoch` so prior memories are un-recallable. Recall injected into the LEADING system prompt (`recallMemoryBlock`, `lib/memwal.ts`).
- **Non-custodial** — zkLogin Passport; the server never holds keys; every money move taps to confirm.
- Manage everything in-app under **Settings** (there is NO separate "Passport app"). The agent's self-knowledge lives in `aboutAudricPrompt` (`lib/ai/prompts.ts`).

---

## Auth: zkLogin + Enoki

- Google sign-in → verify id_token → derive Sui address (Enoki) → mint a **stateless HS256 httpOnly session cookie** (`lib/audric-auth.ts`, ~7-day cap). **No server-side session store** — the cookie is a signed token holding only `{ address, email }`.
- `user.id` = the Sui address (text). Sensitive zkLogin material (ephemeral key + JWT) lives in the browser; the server never holds keys.
- Anonymous "try before signup" allowed: free-model-only, no persistence. Premium models + history + wallet require sign-in.

---

## Data (Drizzle + Neon Postgres) — `lib/db/schema.ts`

`User` (id = Sui address; email, subscriptionTier, Stripe fields, `memoryEpoch`, credit config) · `CreditLedger` (append-only; balance = `SUM(amountMicros)`) · `Chat` · `Message_v2` (`parts` JSON) · `Vote_v2` · `Document` (artifacts) · `Suggestion` · `Stream`. Chats/messages are private + encrypted-at-rest (E2E-sealed chats are roadmap).

> Migrations: Drizzle (`lib/db/migrations/`). The `0001_*` migration added `memoryEpoch`.

---

## Billing (Stripe) — `lib/credit/`

Native in-app billing (Stripe Elements). **Free $0 · Pro $18/mo (beta, was $36; $25/mo credit) · Max $100/mo (beta, was $200; $150/mo credit)** — credit **never expires / rolls over** (append-only ledger; nothing zeroes it). `recordCredit()` / `getCreditBalanceMicros()` in `lib/db/queries.ts`. The free model (Kimi) is never metered. One-off credit admin: `scripts/credit-admin.mts`.

---

## Tooling
- **pnpm** (v10.6.2) · **Turbo** · **Next.js 16** (App Router) / React 19 · **Tailwind v4 + shadcn + AI Elements** (Geist DS) · **Drizzle + Neon** · **Biome/ultracite** · Vercel.
- `ai@6.x` (currently 6.0.208) + `@ai-sdk/react` + `@ai-sdk/provider` (keep these aligned on upgrade).

```bash
pnpm --filter web-v3 dev                      # dev (http://localhost:3002)
pnpm --filter web-v3 build                    # production build
pnpm exec biome check --write <files>         # lint/format (run from apps/web-v3)
/Users/funkii/dev/audric/node_modules/.bin/tsc --noEmit -p tsconfig.json   # typecheck web-v3 only
```

---

## Styling — Geist Design System
shadcn semantic tokens (`bg-background`/`text-foreground`, `bg-card`, `bg-muted`, `border-border`, …) + a single signal accent (cyan). Geist + Geist Mono fonts only. `next-themes` dual attribute; default theme dark. The Audric mark is the diamond (`components/chat/icons.tsx` `AudricMark`; favicon = `app/icon.tsx`, OG = `app/opengraph-image.png`).

---

## Git commits
`emoji type(scope): subject` — ✨feat 🐛fix 📝docs 🎨style ♻️refactor ⚡perf ✅test 📦build 🔧chore. Lowercase subject, always emoji, no "Generated with Claude". Scopes: `web`, `api`, `auth`, `ai`, `ui`.

---

## Env (`lib/env.ts` Zod gate)
**Required:** `ENOKI_SECRET_KEY`, `AUTH_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_SUI_NETWORK`.
**Also used:** `AI_GATEWAY_API_KEY`, `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN`, `REDIS_URL` (rate limit).
**Optional (feature-gated):** `MEMWAL_PRIVATE_KEY`/`MEMWAL_ACCOUNT_ID`/`MEMWAL_SERVER_URL` (memory) · `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_PRO`/`STRIPE_PRICE_MAX`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (billing) · `AUDRIC_PARENT_NFT_PRIVATE_KEY` (@handles) · `PHALA_API_KEY` + `CONFIDENTIAL_ANCHOR_SIGNER_KEY` (Confidential GPU-TEE — **LIVE**: attested inference + anchor-every; receipts durably stored in Redis) · `PERPLEXITY_API_KEY` (web_search titles).

---

## Roadmap (never present as shipped)
End-to-end **sealed chats** (Seal on Walrus) · Decentralized memory backup · Agent Store. Privacy ladder: Anon → Private·ZDR → **Confidential·TEE (LIVE, S.593)** → Sealed(E2E, coming). *(Confidential GPU-TEE mode shipped — no longer roadmap.)*

---

## Key documents (internal, in `t2000/spec/` via the private repo)
`SPEC_AUDRIC_V3.md` (canon) · `SITE_REPOSITIONING_BRIEF.md` (positioning accumulator) · `audric-build-tracker.md` (execution log, latest `S.N` on top) · `handoffs/audric-HANDOFF_NEXT_AGENT.md` (ranked backlog).

## Links
audric.ai · t2000.ai · suimpp.dev · mpp.t2000.ai · developers.t2000.ai (docs SSOT)
