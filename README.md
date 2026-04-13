# Audric

**Your money, handled.**

Conversational finance on [Sui](https://sui.io). Save, pay, send, borrow — all by talking to your AI financial agent. Built on [t2000](https://t2000.ai) infrastructure.

**Live at [audric.ai](https://audric.ai)**

---

## What it does

| Product | Description |
|---------|-------------|
| **Savings** | Earn yield on USDC via NAVI Protocol |
| **Pay** | Access 40+ services (88 endpoints) with USDC micropayments |
| **Send** | Transfer any supported token to any Sui address |
| **Credit** | Borrow USDC against your savings |
| **Receive** | Payment links, invoices, QR codes — accept payments anywhere |

Swap is available as a utility within flows (any token pair via Cetus Aggregator), not a standalone product.

## How it works

1. **Sign in with Google** — no seed phrase, no keys, no downloads (zkLogin)
2. **Fund your wallet** — deposit USDC to your Sui address
3. **Talk** — tell Audric what you need

Your money lives in a non-custodial wallet. Audric executes transactions, but you approve every one. Zero gas fees.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Auth | zkLogin via Enoki (Google OAuth → Sui wallet) |
| Gas | Enoki sponsored transactions (zero gas for users) |
| AI | `@t2000/engine` — 47 tools, reasoning engine, canvas, DCA/schedules |
| Database | NeonDB (Prisma) — users, profiles, memories, goals, schedules, analytics |
| Sessions | Upstash Redis (KV) |
| Styling | Tailwind CSS v4, Agentic Design System |
| Hosting | Vercel |

## Key Features

- **47 financial tools** — balance, savings, lending, payments, analytics, scheduling
- **Reasoning engine** — adaptive thinking, guard rails, skill recipes, context compaction
- **Rich cards** — 21 structured card types for balances, yields, protocols, prices, and more
- **Canvas visualizations** — 8 interactive canvases (portfolio timeline, activity heatmap, spending breakdown, net worth)
- **Intelligence layer** — financial profile (F1), proactive awareness (F2), episodic memory (F3), conversation state (F4), self-evaluation (F5)
- **DCA / scheduled actions** — recurring deposits, buys, and transfers with trust ladder
- **Morning briefings** — daily digest of portfolio changes, follow-ups, and alerts
- **Unified data layer** — centralized portfolio and activity data consumed by API routes, canvases, and engine

## Architecture

```
audric.ai (this repo)
├── @t2000/engine    ← Agent engine (47 tools, reasoning, MCP, streaming)
├── @t2000/sdk       ← Core SDK (wallet, balance, transactions)
├── @suimpp/mpp      ← MPP payment client (Sui USDC)
└── @mysten/sui      ← Sui blockchain client

t2000.ai (separate repo)
├── CLI, SDK, MCP server, gateway, contracts
└── Infrastructure that powers Audric
```

## Development

```bash
pnpm install
pnpm dev              # Start dev server (Turbo + Next.js)
pnpm build            # Production build
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
pnpm test             # Vitest
```

### Environment

Copy `.env.example` to `.env.local` and fill in the required values. See `CLAUDE.md` for the full list.

## Brand

- **Audric** is the consumer product — what users see
- **t2000** is the infrastructure — what developers build with
- **suimpp** is the protocol — the open payment standard

## License

MIT
