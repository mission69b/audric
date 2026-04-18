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
| AI | `@t2000/engine` — 40 tools, reasoning engine, extended thinking, canvas |
| Database | NeonDB (Prisma) — 15 models (users, profiles, memories, goals, advice log, conversation log, payments, contacts, app events) |
| Sessions | Upstash Redis (KV) |
| Styling | Tailwind CSS v4, Agentic Design System |
| Hosting | Vercel |

## AI Agent Capabilities

### 40 Financial Tools

29 read tools + 11 write tools covering balance checks, savings, lending, swaps, payments, payment links / invoices, and on-chain analytics. Read tools execute in parallel; write tools require user confirmation and execute sequentially under a transaction mutex.

### Reasoning Engine

- **Extended thinking** — always-on for Sonnet/Opus (adaptive mode). Haiku for low-effort queries
- **Adaptive effort** — classifies each turn as `low`/`medium`/`high`/`max` and adjusts model + thinking depth
- **Guard runner** — 9 guards across 3 priority tiers (Safety > Financial > UX) enforce balance checks, health factor limits, slippage thresholds, and irreversibility warnings
- **Skill recipes** — 7 YAML recipes (swap-and-save, safe-borrow, emergency-withdraw, etc.) with longest-trigger-match-wins
- **Preflight validation** — input validation on send, swap, pay, borrow, and save before execution
- **Prompt caching** — static system prompt + tool definitions cached across turns for lower latency and cost

### Silent Intelligence Layer

| Feature | What it does |
|---------|-------------|
| **Financial Profile** | Risk tolerance, goals, investment horizon — inferred by Claude, stored in Prisma. Silently calibrates tone + recommendations |
| **Episodic Memory** | Key facts, preferences, past decisions remembered across sessions (50-memory cap, Jaccard dedup) |
| **Advice Memory** | `record_advice` tool writes `AdviceLog` rows; `buildAdviceContext()` hydrates last 30 days into every turn so the chat remembers what it told you yesterday |
| **Conversation Log** | Full chat transcripts logged for the future self-hosted model migration |

> **What was deleted in the April 2026 simplification:** Copilot suggestions, scheduled actions / DCA, morning briefings, rate alerts, auto-compound, the features-budget allowance, the proactive-nudges pipeline, savings-goal milestone celebrations, follow-up queues, and the proposal pipeline behind `BehavioralPattern`. zkLogin can't sign without user presence — "autonomous" was reminders dressed up as agency. See [`spec/SIMPLIFICATION_RATIONALE.md`](https://github.com/mission69b/t2000/blob/main/spec/SIMPLIFICATION_RATIONALE.md) for the locked decisions on what we will not bring back.

### Chain Memory (silent)

7 on-chain classifiers extract financial patterns from AppEvent + PortfolioSnapshot history and feed them silently to the agent — no proposals, no surface, no notifications:

deposit patterns, risk profile, yield behavior, borrow behavior, near-liquidation events, large transactions, compounding streaks. Chain facts stored as `ChainFact` rows and injected into the engine system prompt via `buildMemoryContext()`.

### Canvas Visualizations

Interactive HTML canvases rendered in-chat: portfolio timeline, activity heatmap, spending breakdown, yield projector, health simulator, watch list, and full portfolio dashboard. Generated via the `render_canvas` tool and delivered as `canvas` SSE events.

### Rich Cards

Structured card types for tool results: balance, savings, health, staking, protocol deep dive, price, swap quote, transaction history, receipts, spending, yield, activity summary, payment links, and invoices.

### Public Wallet Report

Analyze any Sui wallet at `audric.ai/report/[address]` — no sign-up required:

- Portfolio breakdown, yield efficiency gauge, activity stats
- 5 pattern detectors, 3 risk signals, 4 "Audric would do" suggestions (all heuristic, no LLM)
- Share: copy link, Twitter, Telegram, image download, QR code
- Dynamic OG image (1200×630) for social media previews
- Rate limited (5/hr/IP), 24h cache, multi-wallet support (link up to 10 addresses)

### Additional Features

- **Savings goals** — named goals with deadlines and progress tracking (silent — no notifications)
- **Critical Health Factor email** — the only proactive surface: real-time indexer hook fires when HF < 1.2 (liquidation imminent). Always on, no opt-out
- **Session pre-fetch** — balance + savings data injected at turn 0 for faster first responses
- **Streaming tool dispatch** — read-only tools fire mid-stream before the LLM finishes
- **Tool result budgeting** — large results auto-truncated with re-call hints
- **Microcompact** — deduplicates identical tool calls in conversation history
- **Daily-free billing** — 5 sessions per rolling 24h for unverified users, 20 for verified. No paywall, no allowance setup
- **Unified data layer** — centralized portfolio + activity modules consumed by all API routes, canvases, and engine context

## Architecture

```
audric.ai (this repo)
├── @t2000/engine    ← Agent engine (40 tools, reasoning, MCP, streaming)
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
