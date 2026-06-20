# Audric v3

**Private, decentralized AI — truly yours.** A private-by-default, permissionless,
multi-model AI agent on Sui: Google sign-in → a non-custodial zkLogin Passport
wallet → an AI that can search, generate, send USDC (P2P), and run paid Recipes.

Part of the [t2000](https://t2000.ai) stack — consumes `@t2000/sdk`.

## Stack

- **Next.js** App Router (React 19) + **AI SDK v6** (`ai`) over the AI Gateway
  (chat, web search, image, reasoning; zero-data-retention by default)
- **Audric Intelligence** — per-turn **Auto** model router (`lib/ai/intelligence/router.ts`:
  classify → model + reasoning effort + step budget, entitlement-aware),
  **visible multi-step research** (research-shaped turns run several live
  `web_search` steps in the main loop → cited synthesis, rendered in a
  chain-of-thought timeline), and opt-in artifacts/recipes. Verify harnesses:
  `pnpm eval:router` · `pnpm smoke:models`
- **zkLogin Passport** auth (`@mysten/enoki` + `@t2000/sdk`) — Google sign-in,
  non-custodial wallet, ~7-day httpOnly app session
- **Drizzle ORM** + Postgres (Neon) for chats / messages / credit ledger
- **Private blob seam** (`lib/blob`) — private blobs with a local-fs fallback;
  Walrus + Seal is the post-launch decentralized swap behind the same interface
- **Private Memory** (`@mysten-incubation/memwal`) — opt-in, off by default
- **Credit rail** (Stripe) — card top-up → metered premium models; P2P + Recipes
  paid in USDC from the Passport
- **shadcn/ui** + Tailwind + AI Elements

## Running locally

Copy `.env.example` → `.env.local` and fill in the required values (the env
contract is validated at boot by `lib/env.ts`). Then:

```bash
pnpm install
pnpm db:migrate   # apply schema to your Postgres
pnpm dev          # http://localhost:3002
```

Optional features (memory, credit/Stripe, redis streams) stay off until their
env vars are set — see `lib/env.ts`.

## Deploying

See **[`DEPLOY.md`](./DEPLOY.md)** — Vercel setup, the full env contract, the
production Stripe webhook, OAuth/Enoki origins, and the post-deploy smoke list.

---

Built on the [Vercel AI Chatbot](https://github.com/vercel/ai-chatbot) template
(MIT — see `LICENSE`).
