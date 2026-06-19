# Deploying Audric v3 (`v3.audric.ai`)

Founder-driven checklist. The app is a Next 16 / pnpm-monorepo workspace
(`@audric/web-v3`) consuming `@t2000/sdk`. Build runs DB migrations then
`next build` (see `package.json` → `build`).

## 1. Vercel project

- New Vercel project from the `audric` repo.
- **Root Directory:** `apps/web-v3`. **Install:** `pnpm install` (monorepo).
- **Build Command:** default (`pnpm build` → `tsx lib/db/migrate && next build`).
- Node 20+.

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
| `STRIPE_PRICE_PLUS` / `_PRO` / `_MAX` | Subscriptions (run `pnpm stripe:seed` against the live account first; inert until set) |

## 3. Auth origins (zkLogin)

- **Google OAuth** → add `https://v3.audric.ai` to Authorized JavaScript origins
  and `https://v3.audric.ai/auth/callback` to redirect URIs.
- **Enoki** → add `https://v3.audric.ai` to the allowed origins for the key.

## 4. Stripe production webhook (replaces `stripe listen`)

`stripe listen` is **dev-only**. For prod, register a real endpoint:

- Stripe Dashboard → Developers → Webhooks → Add endpoint:
  `https://v3.audric.ai/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`.
- Copy the endpoint's **Signing secret** → set `STRIPE_WEBHOOK_SECRET` in Vercel.
- (If using subscriptions) run the seed against the live account and set the
  three `STRIPE_PRICE_*`.

## 5. Database

- Use a dedicated **production** Neon branch/DB (not the dev one).
- Migrations run automatically in the build step (`tsx lib/db/migrate`).

## 6. "Try v3" toggle (on the existing audric surface)

Lives on the current audric site/app, not in web-v3: add a link/banner →
`https://v3.audric.ai`. Founder action on that surface.

## 7. Post-deploy smoke

- [ ] Anonymous: load `/`, chat on the free model (Kimi), web search works.
- [ ] Sign in with Google → Passport address + 7-day session.
- [ ] Premium model gated on credit; free model never gated.
- [ ] Image generation renders inline.
- [ ] P2P `send_transfer` taps to confirm (gasless).
- [ ] Credit: card top-up → webhook 200 → balance updates.
- [ ] Subscriptions (if enabled): subscribe → tier + included credit.
- [ ] Settings: delete-all-chats + purge-all work; memory toggle persists.
