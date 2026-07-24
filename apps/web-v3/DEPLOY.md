# Deploying Audric (`audric.ai`)

> Live app = `apps/web-v3` at apex `audric.ai`. The legacy `apps/web-v2`
> (`legacy.audric.ai` / `v2.audric.ai`) was **deleted from the repo
> 2026-07-24** — do not redeploy it. Rollback is v3-only (redeploy / revert
> git on the `audric-web-v3` Vercel project).

Founder-driven checklist. The app is a Next 16 / pnpm-monorepo workspace
(`@audric/web-v3`) consuming `@t2000/sdk`. Build runs DB migrations then
`next build` (see `package.json` → `build`).

## 1. Vercel project

- Vercel project from the `audric` repo (project name historically
  `audric-web-v3`).
- **Root Directory:** `apps/web-v3`. **Install:** `pnpm install` (monorepo).
- **Build Command:** default (`pnpm build` → `tsx lib/db/migrate && next build`).
- Node 20+.
- Domains: `audric.ai` + `www.audric.ai`.

## 2. Environment variables (Vercel → Settings → Environment Variables)

The env contract is validated at boot (`lib/env.ts`) — a missing/empty
**required** var fails the deploy loudly (by design).

**Required:**
| Var | Notes |
|---|---|
| `POSTGRES_URL` | Neon (production branch — separate from dev) |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway (chat, search, image) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — enables **private** prod blobs (without it, the local-fs fallback is used, which won't work on serverless) |
| `AUTH_SECRET` | HS256 secret for the 7-day app session — generate fresh, do NOT reuse dev |
| `ENOKI_SECRET_KEY` | Enoki server key (zkLogin / sponsorship) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client (must allow the prod origin) |
| `NEXT_PUBLIC_ENOKI_API_KEY` | Enoki publishable key |
| `NEXT_PUBLIC_SUI_NETWORK` | `mainnet` |

**Optional (feature-gated — unset = feature off, no boot failure):**
| Var | Enables |
|---|---|
| `REDIS_URL` | resumable streams |
| `MEMWAL_PRIVATE_KEY` / `MEMWAL_ACCOUNT_ID` / `MEMWAL_SERVER_URL` | Private Memory (set all three) |
| `STRIPE_SECRET_KEY` | Credit rail. Use the **live** key for prod. |
| `STRIPE_WEBHOOK_SECRET` | The **production** webhook secret (see §4 — NOT the local `stripe listen` value) |
| `STRIPE_PRICE_PRO` / `_MAX` | Subscriptions (run `pnpm stripe:seed` against the live account first; inert until set) |

## 3. Auth origins (zkLogin)

- **Google OAuth** → Authorized JavaScript origins: `https://audric.ai`,
  `https://www.audric.ai`. Redirect URIs:
  `https://audric.ai/auth/callback` (+ the www variant).
- **Enoki** → add `https://audric.ai` (+ www) to the key's allowed origins.

Remove any leftover `legacy.audric.ai` / `v2.audric.ai` / `v3.audric.ai`
origins once those hostnames are gone.

## 4. Stripe production webhook (replaces `stripe listen`)

`stripe listen` is **dev-only**. For prod, register a real endpoint:

- Stripe Dashboard → Developers → Webhooks → Add endpoint:
  `https://audric.ai/api/stripe/webhook`.
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`.
- Copy the endpoint's **Signing secret** → set `STRIPE_WEBHOOK_SECRET` in Vercel.
- (If using subscriptions) run the seed against the live account and set the
  three `STRIPE_PRICE_*`.

## 5. Database

- Use a dedicated **production** Neon branch/DB (not the dev one).
- Migrations run automatically in the build step (`tsx lib/db/migrate`).
- This is **Drizzle + `POSTGRES_URL`** via `@audric/accounts`. The old
  web-v2 Prisma / `DATABASE_URL` Neon is unrelated — safe to archive after
  confirming no handle-backfill work remains.

## 6. Domains

Apex + www already point at the web-v3 Vercel project. If a hostname still
resolves to the retired `audric-web-v2` project, remove it there and delete
that Vercel project.

## 7. Post-deploy smoke

- [ ] Anonymous: load `/`, chat on the free model (Kimi), web search works.
- [ ] Sign in with Google → Passport address + 7-day session.
- [ ] Premium model gated on credit; free model never gated.
- [ ] Image generation renders inline.
- [ ] Send USDC (tap-to-confirm) lands on-chain.
- [ ] Settings: memory toggle, delete chat, purge-all.
- [ ] Confidential mode: toggle → TEE model → verify receipt.
