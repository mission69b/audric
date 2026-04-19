# Audric

**Your money, handled.**

Conversational finance on [Sui](https://sui.io). Save, pay, send, borrow — all by talking to your AI financial agent. Built on [t2000](https://t2000.ai) infrastructure.

**Live at [audric.ai](https://audric.ai)**

---

## The five products

Audric is exactly five products. Everything you can do is one of them. (S.18 reverted S.17's Finance retirement — Intelligence was carrying both "the moat" and "the home for every financial verb," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive.)

| Product | Description |
|---------|-------------|
| 🪪 **Audric Passport** | Trust layer — sign in with Google, non-custodial Sui wallet in 3 seconds, every write taps to confirm, sponsored gas. Wraps every other product. |
| 🧠 **Audric Intelligence** | The brain (the moat) — 5 systems: Agent Harness (40 tools), Reasoning Engine (9 guards, 7 skill recipes), Silent Profile, Chain Memory, AdviceLog. Engineering-facing brand; users experience it as "Audric just understood me." |
| 💰 **Audric Finance** | Manage your money on Sui — Save (NAVI lend, 3–8% APY on USDC), Credit (NAVI borrow, health factor visible), Swap (Cetus aggregator across 20+ DEXs, 0.1% fee), Charts (interactive yield/health/portfolio viz from chat). Every write taps to confirm via Passport. |
| 💸 **Audric Pay** | Money primitive — send USDC to anyone, receive via payment links / invoices / QR. Free, global, instant on Sui. No bank, no borders, no fees. |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. Sell AI-generated music, art, ebooks in USDC. **Coming soon (Phase 5).** |

Plus one public tool that needs no sign-up:

- **Public Wallet Report** at `audric.ai/report/[address]` — heuristic portfolio analysis, yield efficiency, risk signals. No LLM, no sign-up.

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

## Audric Intelligence — the 5-system moat

> **Not a chatbot. A financial agent.** Five systems work together to understand your money, reason about decisions, and get smarter over time. Every action still waits on Audric Passport's tap-to-confirm.

### 🎛️ Agent Harness — 40 tools, one agent

29 read tools + 11 write tools covering balance checks, savings (`save_deposit`, `withdraw`), lending (`borrow`, `repay_debt`), swaps (`swap_quote`, `swap_execute`), liquid staking (`volo_stake`, `volo_unstake`), payments (`send_transfer`, `pay_api`), payment links / invoices, and on-chain analytics. Read tools execute in parallel; write tools require user Passport confirmation and execute sequentially under a transaction mutex (`TxMutex`).

### ⚡ Reasoning Engine — thinks before it acts

- **Extended thinking** — always-on for Sonnet/Opus (adaptive mode). Haiku for low-effort queries
- **Adaptive effort** — classifies each turn as `low`/`medium`/`high`/`max` and adjusts model + thinking depth
- **Guard runner** — 9 guards across 3 priority tiers (Safety > Financial > UX) enforce balance checks, health factor limits, slippage thresholds, and irreversibility warnings
- **Skill recipes** — 7 YAML recipes (swap-and-save, safe-borrow, emergency-withdraw, etc.) with longest-trigger-match-wins
- **Preflight validation** — input validation on send, swap, pay, borrow, and save before execution
- **Prompt caching** — static system prompt + tool definitions cached across turns for lower latency and cost

### 🧠 Silent Profile — knows your finances

`UserFinancialProfile` (risk tolerance, goals, investment horizon) inferred by Claude from your chat history. Stored in Prisma, injected via `buildProfileContext()`. Silently calibrates tone + recommendations — never surfaced as nudges.

### 🔗 Chain Memory — remembers what you do on-chain

7 on-chain classifiers (deposit patterns, risk profile, yield behavior, borrow behavior, near-liquidation events, large transactions, compounding streaks) extract financial facts from `AppEvent` + `PortfolioSnapshot` history → `ChainFact` rows → `buildMemoryContext()` injects them into the engine system prompt. Silent context only.

### 📓 AdviceLog — remembers what it told you

`record_advice` tool writes `AdviceLog` rows; `buildAdviceContext()` hydrates last 30 days into every turn so the chat doesn't contradict itself across sessions. Episodic memory (`UserMemory`) and the full conversation log run alongside it for the future self-hosted model migration.

> **What was deleted in the April 2026 simplification:** Copilot suggestions, scheduled actions / DCA, morning briefings, rate alerts, auto-compound, the features-budget allowance, the proactive-nudges pipeline, savings-goal milestone celebrations, follow-up queues, and the proposal pipeline behind `BehavioralPattern`. zkLogin can't sign without user presence — "autonomous" was reminders dressed up as agency. See [`spec/SIMPLIFICATION_RATIONALE.md`](https://github.com/mission69b/t2000/blob/main/spec/SIMPLIFICATION_RATIONALE.md) for the locked decisions on what we will not bring back.

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
