# Deploying Audric v3 (→ apex `audric.ai`)

> **Plan: v3 becomes the primary site at `audric.ai`; the current web-v2 moves
> to `v2.audric.ai`.** Stage it (verify v3 on a temp domain first, then cut the
> apex over) — see §6. web-v2 is live with real users, so the swap is the
> highest-risk step; it's also a fast DNS rollback.

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

Add BOTH the temp verification domain (e.g. `https://v3.audric.ai`) and the
final apex up front, so nothing breaks at cutover:

- **Google OAuth** → Authorized JavaScript origins: `https://audric.ai`,
  `https://www.audric.ai`, `https://v3.audric.ai`. Redirect URIs:
  `https://audric.ai/auth/callback` (+ the www / v3 variants).
- **Enoki** → add `https://audric.ai` (+ www, + the temp domain) to the key's
  allowed origins.

## 4. Stripe production webhook (replaces `stripe listen`)

`stripe listen` is **dev-only**. For prod, register a real endpoint:

- Stripe Dashboard → Developers → Webhooks → Add endpoint:
  `https://audric.ai/api/stripe/webhook` (use the temp domain while verifying,
  then update to the apex at cutover).
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`.
- Copy the endpoint's **Signing secret** → set `STRIPE_WEBHOOK_SECRET` in Vercel.
- (If using subscriptions) run the seed against the live account and set the
  three `STRIPE_PRICE_*`.

## 5. Database

- Use a dedicated **production** Neon branch/DB (not the dev one).
- Migrations run automatically in the build step (`tsx lib/db/migrate`).

## 6. Domain cutover (v3 → apex `audric.ai`, web-v2 → `v2.audric.ai`)

Stage it — don't point the apex at an unverified deploy:

1. **Deploy + verify v3 on a temp domain first** (e.g. `v3.audric.ai` on the v3
   Vercel project). Run the §7 smoke there. Do NOT cut the apex until it's green.
2. **Move web-v2 to `v2.audric.ai`:** in the web-v2 Vercel project, add the
   `v2.audric.ai` domain, then remove the apex `audric.ai` (+ www). Update
   web-v2's own OAuth/Enoki origins + any hardcoded `audric.ai` URLs to
   `v2.audric.ai` so it keeps working there.
3. **Point the apex at v3:** in the v3 project, add `audric.ai` (+ `www`).
4. **Flip v3's config to the apex:** update v3's OAuth/Enoki origins + the Stripe
   webhook endpoint to `https://audric.ai` (§3/§4).
5. **Rollback (fast):** if anything is wrong, re-add the apex domain to the
   web-v2 project — DNS/domain reassignment, no redeploy needed.

Notes: web-v2 is live with real users — do step 2 in a low-traffic window and
keep it reachable at `v2.audric.ai`. A small "Try the new Audric" link from
v2 → apex is a nice-to-have, not required (the apex IS v3 after cutover).

## 7. Post-deploy smoke

- [ ] Anonymous: load `/`, chat on the free model (Kimi), web search works.
- [ ] Sign in with Google → Passport address + 7-day session.
- [ ] Premium model gated on credit; free model never gated.
- [ ] Image generation renders inline.
- [ ] P2P `send_transfer` taps to confirm (gasless).
- [ ] Credit: card top-up → webhook 200 → balance updates.
- [ ] Subscriptions (if enabled): subscribe → tier + included credit.
- [ ] Settings: delete-all-chats + purge-all work; memory toggle persists.
