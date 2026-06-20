# Audric

**Private, decentralized AI — truly yours.**

A private-by-default, permissionless, multi-model AI agent on [Sui](https://sui.io): sign in with Google → get a non-custodial zkLogin Passport wallet → chat with the best open and frontier models, search the web, generate images, do deep research, and move your own USDC — no account, no KYC, no seed phrase. Built on [t2000](https://t2000.ai) infrastructure.

**Live at [audric.ai](https://audric.ai)**

---

## What you get

- **Private & permissionless** — zero data retention by default (your chats are never training data); no KYC, no seed phrase. Sign in with Google, get a wallet in seconds.
- **The best models, chosen for you** — open/uncensored models (Kimi, DeepSeek, Grok, GPT-OSS) and frontier models (Claude, GPT-5.5, Gemini). **Auto** picks the right one for every task automatically.
- **A real agent** — live web search, image generation, and a **deep-research** subagent that gathers and synthesizes cited sources.
- **Your wallet, your money** — a non-custodial Passport wallet. Send USDC + USDsui to anyone, free, instant, and gasless.
- **Recipes** — curated, pay-per-use live-data flows (markets, tickers) paid in USDC from your Passport.
- **Private memory** — opt-in, encrypted, deletable anytime.

## How it works

1. **Sign in with Google** — no seed phrase, no keys, no downloads (zkLogin).
2. **Chat** — ask anything; Audric picks the right model, searches, researches, creates, or moves money.
3. **You decide** — every money action waits on your tap-to-confirm. Audric never moves funds on its own.

## Audric Intelligence

Not a chatbot — an agent that figures out what each turn needs and does it, using the best models to their fullest:

- **Auto routing** — a per-turn classifier picks the model + reasoning effort + step budget for the task (a quick reply on a fast free model; deep analysis on a frontier model), within what you're entitled to.
- **Deep research** — for multi-faceted questions, an isolated subagent runs several searches and returns a cited synthesis, then self-reviews it.
- **Opt-in surfaces** — artifacts (side-panel docs/code/images) and paid Recipes activate only when you ask, so a normal question gets a clean inline answer with no surprises.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19 |
| AI | AI SDK v6 (`ai`) over the Vercel AI Gateway — chat, web search, image, reasoning; zero-data-retention by default |
| Auth | zkLogin Passport — `@mysten/enoki` + `@t2000/sdk` (Google → non-custodial Sui wallet, ~7-day httpOnly session) |
| Chain | `@t2000/sdk` (gRPC) — gasless USDC/USDsui send, swap, x402 pay |
| Data | Neon Postgres + Drizzle (chats / messages / credit ledger) |
| Memory | `@mysten-incubation/memwal` — opt-in, off by default |
| Storage | private blob seam (local-fs fallback today; Walrus + Seal is the post-launch decentralized swap) |
| Billing | Stripe — card top-up → metered premium models; P2P + Recipes paid in USDC |
| Styling | Tailwind + shadcn/ui + AI Elements |
| Hosting | Vercel |

## Architecture

```
audric.ai → apps/web-v3   ← the live app (this is where work happens)
            apps/web-v2   ← legacy/frozen (legacy.audric.ai); the old finance app on @t2000/*@4.x

@t2000/sdk   ← wallet + payments (send / swap / x402 pay), gRPC
t2000.ai     ← separate repo: CLI, SDK, MCP, gateway, contracts — the infra that powers Audric
```

See [`apps/web-v3/README.md`](./apps/web-v3/README.md) for app-level docs (stack, running locally, deploy).

## Development

```bash
pnpm install
pnpm --filter web-v3 dev          # http://localhost:3002
pnpm --filter web-v3 exec tsc --noEmit   # typecheck
pnpm --filter web-v3 exec biome check     # lint/format (Biome / ultracite)
```

Copy `apps/web-v3/.env.example` → `.env.local` and fill the required values — validated at boot by `apps/web-v3/lib/env.ts`.

## Brand

- **Audric** is the consumer product — what users see.
- **t2000** is the infrastructure — what developers build with.
- **suimpp** is the protocol — the open payment standard.

## License

[AGPL-3.0](./LICENSE). Audric is open source; its network-use copyleft means anyone running a modified version as a hosted service must release their changes under the same license. (The t2000 infrastructure packages are MIT.)
