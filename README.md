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
| 🧠 **Audric Intelligence** | The brain (the moat) — 5 systems: Agent Harness (35 tools), Reasoning Engine (14 guards, 6 skill recipes), Silent Profile, Chain Memory, AdviceLog. Engineering-facing brand; users experience it as "Audric just understood me." |
| 💰 **Audric Finance** | Manage your money on Sui — Save (NAVI lend, 3–8% APY on USDC or USDsui — strategic exception added in v0.51.0), Credit (NAVI borrow USDC or USDsui against your savings, health factor visible — repay must use the same asset as the borrow), Swap (Cetus aggregator across 20+ DEXs, 0.1% fee), Charts (interactive yield/health/portfolio viz from chat). Every write taps to confirm via Passport. |
| 💸 **Audric Pay** | Money primitive — send USDC to anyone, receive via payment links / invoices / QR. Free, global, instant on Sui. No bank, no borders, no fees. |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. Sell AI-generated music, art, ebooks in USDC. **Coming soon (Phase 5).** |

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
| AI | `@t2000/engine` — 35 tools, reasoning engine, extended thinking, canvas |
| Database | NeonDB (Prisma) — 15 models (users, user preferences, profiles, memories, financial context, advice log, conversation log, session usage, payments, watch addresses, linked wallets, portfolio snapshots, turn metrics, app events, service purchases) |
| Sessions | Upstash Redis (KV) |
| Styling | Tailwind CSS v4, Agentic Design System |
| Hosting | Vercel |

## Audric Intelligence — the 5-system moat

> **Not a chatbot. A financial agent.** Five systems work together to understand your money, reason about decisions, and get smarter over time. Every action still waits on Audric Passport's tap-to-confirm.

### 🎛️ Agent Harness — 35 tools, one agent

24 read tools + 11 write tools covering balance checks, savings (`save_deposit`, `withdraw`), lending (`borrow`, `repay_debt`), swaps (`swap_quote`, `swap_execute`), liquid staking (`volo_stake`, `volo_unstake`), payments (`send_transfer`, `pay_api`), payment links / invoices, on-chain analytics, BlockVision-backed pricing (`token_prices`), and SuiNS resolution (`resolve_suins`). Read tools execute in parallel; write tools require user Passport confirmation and execute sequentially under a transaction mutex (`TxMutex`).

### ⚡ Reasoning Engine — thinks before it acts

- **Extended thinking** — always-on for Sonnet/Opus (adaptive mode). Haiku for low-effort queries
- **Adaptive effort** — classifies each turn as `low`/`medium`/`high`/`max` and adjusts model + thinking depth
- **Guard runner** — 14 guards (12 pre-execution + 2 post-execution hints) across 3 priority tiers (Safety > Financial > UX) enforce balance freshness, health factor limits, slippage thresholds, irreversibility warnings, address-source / address-scope / asset-intent gates, swap preview confirmation, retry protection, and cost warnings
- **Skill recipes** — 6 YAML recipes (`swap_and_save`, `safe_borrow`, `send_to_contact`, `portfolio_rebalance`, `account_report`, `emergency_withdraw`) with longest-trigger-match-wins
- **Preflight validation** — input validation on send, swap, pay, borrow, and save before execution
- **Prompt caching** — static system prompt + tool definitions cached across turns for lower latency and cost

### 🧠 Silent Profile — knows your finances

`UserFinancialProfile` (risk tolerance, goals, investment horizon) inferred by Claude from your chat history, plus a daily on-chain orientation snapshot — `UserFinancialContext` (savings/wallet/debt USD, health factor, current APY, open goals, recent activity, last-session days) — refreshed at 02:00 UTC and injected as a `<financial_context>` block at every engine boot. Stored in Prisma, hydrated via `buildProfileContext()` + `buildFinancialContextBlock()`. Silently calibrates tone + recommendations — never surfaced as nudges.

### 🔗 Chain Memory — remembers what you do on-chain

7 on-chain classifiers (deposit patterns, risk profile, yield behavior, borrow behavior, near-liquidation events, large transactions, compounding streaks) extract financial facts from `AppEvent` + `PortfolioSnapshot` history → `ChainFact` rows → `buildMemoryContext()` injects them into the engine system prompt. Silent context only.

### 📓 AdviceLog — remembers what it told you

`record_advice` tool writes `AdviceLog` rows; `buildAdviceContext()` hydrates last 30 days into every turn so the chat doesn't contradict itself across sessions. Episodic memory (`UserMemory`) and the full conversation log run alongside it for the future self-hosted model migration.

> **What was deleted in the April 2026 simplification:** Copilot suggestions, scheduled actions / DCA, morning briefings, rate alerts, auto-compound, the features-budget allowance, the proactive-nudges pipeline, savings-goal milestone celebrations, follow-up queues, and the proposal pipeline behind `BehavioralPattern`. zkLogin can't sign without user presence — "autonomous" was reminders dressed up as agency. **Update (S.103, May 2026):** the broader **savings-goal layer was fully retired in SPEC 17** — `SavingsGoal` Prisma table, 4 `savings_goal_*` engine tools, GoalsPanel UI, settings tab, and `openGoals` snapshot field all dropped. The "track my savings progress" job is now served by `health_check` + `portfolio_overview` + `yield_summary`. See the S.0–S.19 + S.103 entries in [`audric-build-tracker.md`](https://github.com/mission69b/t2000/blob/main/audric-build-tracker.md) for the locked decisions on what we will not bring back.

### What shipped recently — Spec 1 + Spec 2

Two harness upgrades on top of the 5-system base:

| Spec | Versions | What it added |
|---|---|---|
| **Spec 1 — Correctness** | `@t2000/engine` v0.41.0 → v0.50.3 | `attemptId` UUID v4 stamped on every `pending_action` (stable join key from action → on-chain receipt → `TurnMetrics.pendingActionOutcome` row). `modifiableFields` registry — fields the user can edit on a confirm card without losing the LLM's reasoning. `EngineConfig.onAutoExecuted` hook so `auto`-permission writes (currently none in Audric) participate in the same telemetry as confirm-gated ones. |
| **Spec 2 — Intelligence** | `@t2000/engine` v0.47.0 → v0.54.1 | BlockVision swap — replaced 7 `defillama_*` tools with one `token_prices` tool; `balance_check` + `portfolio_analysis` rewired to BlockVision Indexer REST. Sticky-positive cache + retry/circuit breaker for graceful 429 handling. `<financial_context>` orientation block injected at every engine boot from the daily 02:00 UTC `UserFinancialContext` snapshot — every chat starts oriented, no warm-up tool calls. `attemptId`-keyed resume so two pending actions in the same turn never clobber each other's outcome. `protocol_deep_dive` retained on DefiLlama as the lone exception. |

> Specs are local working documents (`AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md`, `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`). Cross-repo contracts live in `audric/.cursor/rules/audric-transaction-flow.mdc`, `audric/.cursor/rules/write-tool-pending-action.mdc`, and `t2000/.cursor/rules/agent-harness-spec.mdc`.

### Canvas Visualizations

Interactive HTML canvases rendered in-chat: portfolio timeline, activity heatmap, spending breakdown, yield projector, health simulator, watch list, and full portfolio dashboard. Generated via the `render_canvas` tool and delivered as `canvas` SSE events.

### Rich Cards

Structured card types for tool results: balance, savings, health, staking, protocol deep dive, price, swap quote, transaction history, receipts, spending, yield, activity summary, payment links, and invoices.

### Additional Features

- **Health Factor in chat** — surfaced prominently in `health_check` and `balance_check` cards. As of S.31 (2026-04-29) there are zero proactive surfaces; HF is shown when the user asks (and chat naturally surfaces it whenever they touch credit)
- **Session pre-fetch** — balance + savings data injected at turn 0 for faster first responses
- **Streaming tool dispatch** — read-only tools fire mid-stream before the LLM finishes
- **Tool result budgeting** — large results auto-truncated with re-call hints
- **Microcompact** — deduplicates identical tool calls in conversation history
- **Daily-free billing** — 5 sessions per rolling 24h for unverified users, 20 for verified. No paywall, no allowance setup
- **Unified data layer** — centralized portfolio + activity modules consumed by all API routes, canvases, and engine context

## Architecture

```
audric.ai (this repo)
├── @t2000/engine    ← Agent engine (35 tools, reasoning, MCP, streaming)
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
