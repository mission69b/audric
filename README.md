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
| **Wallet Report** | Public wallet intelligence at `audric.ai/report/[address]` — no sign-up |

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
| AI | `@t2000/engine` — 50 tools, reasoning engine, extended thinking, canvas, autonomy |
| Database | NeonDB (Prisma) — 17+ models (users, profiles, memories, goals, schedules, reports, analytics) |
| Sessions | Upstash Redis (KV) |
| Styling | Tailwind CSS v4, Agentic Design System |
| Hosting | Vercel |

## AI Agent Capabilities

### 50 Financial Tools

38 read tools + 12 write tools covering balance checks, savings, lending, swaps, payments, analytics, scheduling, and autonomous pattern management. Read tools execute in parallel; write tools require user confirmation and execute sequentially under a transaction mutex.

### Reasoning Engine

- **Extended thinking** — always-on for Sonnet/Opus (adaptive mode). Haiku for low-effort queries
- **Adaptive effort** — classifies each turn as `low`/`medium`/`high`/`max` and adjusts model + thinking depth
- **Guard runner** — 9 guards across 3 priority tiers (Safety > Financial > UX) enforce balance checks, health factor limits, slippage thresholds, and irreversibility warnings
- **Skill recipes** — 7 YAML recipes (swap-and-save, safe-borrow, emergency-withdraw, etc.) with longest-trigger-match-wins
- **Preflight validation** — input validation on send, swap, pay, borrow, and save before execution
- **Prompt caching** — static system prompt + tool definitions cached across turns for lower latency and cost

### Intelligence Layer (F1–F5)

| Feature | What it does |
|---------|-------------|
| **Financial Profile** (F1) | Risk tolerance, goals, investment horizon — inferred by Claude, stored in Prisma |
| **Proactive Awareness** (F2) | Idle USDC nudges, HF warnings, follow-up queues injected each turn |
| **Episodic Memory** (F3) | Key facts, preferences, past decisions remembered across sessions (50-memory cap, Jaccard dedup) |
| **Conversation State** (F4) | 6 states (idle → exploring → confirming → executing) tracked in Redis |
| **Self-Evaluation** (F5) | Post-action checklist for outcome tracking and confidence adjustment |

### Autonomous Actions

- **5 behavioral detectors** — recurring saves, yield reinvestment, debt discipline, idle USDC tolerance, swap patterns
- **Trust ladder** — Stage 0 (proposal) → Stage 2 (user-accepted, runs with notification) → Stage 3 (fully autonomous after N successes)
- **Circuit breaker** — 3 consecutive failures auto-pause the pattern + email notification
- **Fail-closed safety** — balance, health factor, daily limit, and borrow-ban checks before every autonomous execution

### Chain Memory

7 on-chain classifiers extract financial patterns from AppEvent + PortfolioSnapshot history:

deposit patterns, risk profile, yield behavior, borrow behavior, near-liquidation events, large transactions, compounding streaks. Chain facts stored as `UserMemory` with `source: 'chain'` and injected into agent context.

### Canvas Visualizations

8 interactive HTML canvases rendered in-chat: portfolio timeline, activity heatmap, spending breakdown, yield projector, health simulator, DCA planner, watch list, and full portfolio dashboard. Generated via the `render_canvas` tool and delivered as `canvas` SSE events.

### Rich Cards

21 structured card types for tool results: balance, savings, health, staking, protocol deep dive, price, swap quote, transaction history, receipts, allowance, spending, yield, activity summary, payment links, invoices, schedules, and more.

### Public Wallet Report

Analyze any Sui wallet at `audric.ai/report/[address]` — no sign-up required:

- Portfolio breakdown, yield efficiency gauge, activity stats
- 5 pattern detectors, 3 risk signals, 4 "Audric would do" suggestions (all heuristic, no LLM)
- Share: copy link, Twitter, Telegram, image download, QR code
- Dynamic OG image (1200×630) for social media previews
- Rate limited (5/hr/IP), 24h cache, multi-wallet support (link up to 10 addresses)

### Additional Features

- **DCA / scheduled actions** — recurring deposits, buys, and transfers with trust progression
- **Morning briefings** — daily + weekly digests with portfolio changes, follow-ups, and alerts
- **Savings goals** — named goals with deadlines, progress tracking, milestone celebrations
- **Session pre-fetch** — balance + savings data injected at turn 0 for faster first responses
- **Streaming tool dispatch** — read-only tools fire mid-stream before the LLM finishes
- **Tool result budgeting** — large results auto-truncated with re-call hints
- **Microcompact** — deduplicates identical tool calls in conversation history
- **Unified data layer** — centralized portfolio + activity modules consumed by all API routes, canvases, and engine context

## Architecture

```
audric.ai (this repo)
├── @t2000/engine    ← Agent engine (50 tools, reasoning, MCP, streaming, autonomy)
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
