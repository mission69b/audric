# Audric

**Your money, handled.**

Conversational finance on [Sui](https://sui.io). Save, pay, send, swap, borrow — all by talking to your AI financial agent. Non-custodial, gas sponsored, every action confirmed by a tap. Built on [t2000](https://t2000.ai) infrastructure.

**Live at [audric.ai](https://audric.ai)**

---

## The five products

Audric is exactly five products — everything you can do is one of them.

| Product | Description |
|---------|-------------|
| 🪪 **Passport** | Trust layer — sign in with Google, non-custodial Sui wallet in seconds, every write taps to confirm, gas sponsored. Wraps every other product. |
| 🧠 **Intelligence** | The brain (the moat) — an agent that understands your finances, reasons about each decision behind safety guards, and remembers context across sessions. |
| 💰 **Finance** | Manage your money on Sui — Save (NAVI lending, USDC/USDsui), Credit (borrow against savings with the health factor always visible), Swap (Cetus best-route across 20+ DEXs), and interactive charts — from chat. |
| 💸 **Pay** | Send USDC to anyone, receive via payment links + QR. Free, global, instant. No bank, no borders, no fees. |
| 🛒 **Store** | Creator marketplace at `audric.ai/username`. Sell AI-generated music, art, and ebooks in USDC. **Coming soon.** |

## How it works

1. **Sign in with Google** — no seed phrase, no keys, no downloads (zkLogin).
2. **Fund your wallet** — deposit USDC to your Sui address.
3. **Talk** — tell Audric what you need.

Your money lives in a non-custodial wallet. Audric proposes transactions; you approve every one with a tap. Gas is sponsored, so you never need SUI to transact.

## Audric Intelligence — the moat

> **Not a chatbot. A financial agent.** Four systems work together to understand your money, reason about decisions, and get smarter over time. Every action still waits on your Passport tap-to-confirm.

- **🎛️ Agent Harness** — 26 tools (18 read + 8 write) for balances, savings, lending, swaps, payments, payment links, on-chain analytics, and pricing. Read tools run in parallel; writes require your confirmation and execute sequentially.
- **⚡ Reasoning Engine** — adaptive thinking effort per turn, 12 safety guards across three tiers (Safety > Financial > UX), preflight input validation, and prompt caching. Multi-step intents are guided by skills (markdown playbooks shipped from `@t2000/mcp`).
- **🧠 Memory** — long-term facts (preferences, goals, risk tolerance, on-chain patterns) in `@mysten-incubation/memwal`, recalled each turn; plus a daily on-chain orientation snapshot. Used silently to calibrate answers — never surfaced as nudges.
- **📓 AdviceLog** — every recommendation is logged so the agent doesn't contradict itself across sessions.

Tool results render as **rich cards** (per-asset balance, savings, health, rates, swap quotes with route diagrams, receipts, payment links, analytics) and **interactive canvases** (portfolio timeline, yield projector, health simulator, and more) delivered in-chat.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| AI | AI SDK v6 (`useChat`) driving `@t2000/engine`, via Vercel AI Gateway |
| Auth | zkLogin via Enoki (Google OAuth → Sui wallet), sponsored gas |
| Chain | `@mysten/sui` v2.x + `@mysten/payment-kit` |
| Data | Neon Postgres (Prisma, 13 models); Upstash Redis for sessions; `@mysten-incubation/memwal` for agent memory |
| Styling | Tailwind v4 + Geist Design System. Token primitives from `@t2000/ui/tokens`; the shadcn layer + Audric's signal accent in `app/globals.css` (guarded by `pnpm check:ads`) |
| Hosting | Vercel |

## Architecture

```
audric.ai (this repo, apps/web-v2)
├── @t2000/engine        ← Agent engine (tools, reasoning, MCP, streaming)
├── @t2000/sdk           ← Core SDK (wallet, balance, transactions)
├── @t2000/ui            ← Geist DS token primitives
├── @mysten/payment-kit  ← Sui payment links / pay-URI client (USDC)
└── @mysten/sui          ← Sui blockchain client

t2000.ai (separate repo)
└── CLI, SDK, MCP server, gateway, contracts — the infrastructure that powers Audric
```

See [`apps/web-v2/README.md`](./apps/web-v2/README.md) for app-level docs (routes, scripts, environment).

## Development

```bash
pnpm install
pnpm dev          # Start dev server (Turbo + Next.js, port 3001)
pnpm build        # Production build
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm lint         # Biome via ultracite
pnpm check:ads    # Guard against legacy ADS-token reintroduction
pnpm test         # Vitest
```

Copy `.env.example` to `.env.local` and fill in the required values — they're validated at boot by the Zod schema in `apps/web-v2/lib/env.ts`. See `CLAUDE.md` for the full list.

## Brand

- **Audric** is the consumer product — what users see.
- **t2000** is the infrastructure — what developers build with.
- **suimpp** is the protocol — the open payment standard.

## License

[AGPL-3.0](./LICENSE). Audric is open source, but its network-use copyleft means anyone who runs a modified version as a hosted service must release their changes under the same license. (The t2000 infrastructure packages are MIT.)
