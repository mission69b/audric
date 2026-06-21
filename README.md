# Audric

**Private, decentralized AI — truly yours.**

A private-by-default, permissionless, multi-model AI agent on [Sui](https://sui.io): sign in with Google → get a non-custodial zkLogin Passport wallet → chat with the best open and frontier models, search the web, generate images, do deep research, and move your own USDC — no account, no KYC, no seed phrase. Built on [t2000](https://t2000.ai) infrastructure.

**Live at [audric.ai](https://audric.ai)**

---

## What you get

- **Private & permissionless** — zero data retention by default (your chats are never training data); no KYC, no seed phrase. Sign in with Google, get a wallet in seconds.
- **The best models, chosen for you** — open/uncensored models (Kimi, DeepSeek, Grok, GPT-OSS) and frontier models (Claude, GPT-5.5, Gemini). **Auto** picks the right one for every task automatically.
- **A real agent** — live web search, image generation, and **visible multi-step research** that runs several live searches (shown step-by-step) then a cited synthesis.
- **Your wallet, your money** — a non-custodial Passport wallet. Send USDC + USDsui to anyone, free, instant, and gasless.
- **Recipes** — curated, pay-per-use live-data flows (markets, tickers) paid in USDC from your Passport.
- **Private memory** — opt-in, encrypted on decentralized storage (Walrus), off by default, deletable anytime.

## How it works

1. **Sign in with Google** — no seed phrase, no keys, no downloads (zkLogin).
2. **Chat** — ask anything; Audric picks the right model, searches, researches, creates, or moves money.
3. **You decide** — every money action waits on your tap-to-confirm. Audric never moves funds on its own.

## Your privacy & data

Privacy isn't a setting — it's how Audric is built.

- **Zero data retention** — every chat runs through a ZDR gateway; your prompts and responses are never stored by model providers or used for training.
- **Private storage** — chats and any files you generate are encrypted at rest and **never served from a public URL** — only you can read them.
- **Decentralized memory** — Private Memory is opt-in and off by default. When on, facts are encrypted on **Walrus** (decentralized storage, not our servers), recalled only when relevant, and wiped anytime with "Forget all" in Settings.
- **Non-custodial** — your wallet is yours. We never hold your keys, and every money move waits on your tap-to-confirm.
- **Yours to delete** — delete any chat, all chats, or purge everything (chats + files) from Settings.

*Coming:* **Confidential (TEE) models** even the provider can't read, and **end-to-end sealed chats** (Seal on Walrus) — the privacy ladder ends at *provably yours*.

## Audric Intelligence

Not a chatbot — an agent that figures out what each turn needs and does it, using the best models to their fullest:

- **Auto routing** — a per-turn classifier picks the model + reasoning effort + step budget for the task (a quick reply on a fast free model; deep analysis on a frontier model), within what you're entitled to.
- **Visible research** — for multi-faceted questions, Audric runs several live web searches shown step-by-step in a Chain-of-Thought timeline, then returns a cited synthesis. Transparent, not a black box.
- **Opt-in surfaces** — artifacts (side-panel docs/code/images) and paid Recipes activate only when you ask, so a normal question gets a clean inline answer with no surprises.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19 |
| AI | AI SDK v6 (`ai`) over the Vercel AI Gateway — chat, web search, image, reasoning; zero-data-retention by default |
| Auth | zkLogin Passport — `@mysten/enoki` + `@t2000/sdk` (Google → non-custodial Sui wallet, ~7-day httpOnly session) |
| Chain | `@t2000/sdk` (gRPC) — gasless USDC/USDsui send, swap, x402 pay |
| Data | Neon Postgres + Drizzle (chats / messages / credit ledger) — private, encrypted at rest (E2E-sealed chats on the roadmap) |
| Memory | `@mysten-incubation/memwal` — opt-in, off by default, encrypted on Walrus (decentralized) |
| Storage | private blob seam — `access:'private'`, no public URLs (local-fs fallback in dev; Walrus + Seal is the post-launch decentralized swap) |
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
