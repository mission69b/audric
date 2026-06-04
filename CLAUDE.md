# CLAUDE.md — Audric

> This file is loaded every turn. Highest-leverage configuration for any AI assistant working on this codebase.

---

## Architecture

### Three brands, three repos

```
t2000 (separate)     → Infrastructure: CLI, SDK, MCP, engine, gateway, contracts
audric (this repo)   → Consumer product: audric.ai — conversational banking
suimpp (separate)    → Protocol: suimpp.dev, @suimpp/mpp, @suimpp/discovery
```

### This repo structure

```
audric/
├── apps/web-v2/                ← audric.ai (Next.js 16, Vercel). The ONLY app (apps/web archived S.253).
│   ├── app/                    ← App Router pages + API routes; chat at app/chat/, API at app/api/chat/
│   ├── components/             ← UI components (auth, settings, pay, ui, audric)
│   │   └── audric/cards/       ← 17 rich card components + canvas/ subdir
│   ├── hooks/                  ← React hooks (use-user-status, etc.)
│   ├── lib/                    ← Utilities, types, constants
│   │   ├── audric/             ← chat-route helpers (resume-outcome, memwal-*, system-prompt, …)
│   │   ├── portfolio.ts        ← Canonical portfolio fetcher (SSOT for wallet + positions + DeFi)
│   │   ├── navi-positions.ts   ← INTERNAL helper used by portfolio.ts (NAVI lending state)
│   │   └── env.ts              ← Zod env schema + typed proxy (the env gate)
│   ├── prisma/                 ← 13 models (User, UserPreferences, SessionUsage, ServicePurchase, AppEvent, AdviceLog, Payment, PortfolioSnapshot, TurnMetrics, UserFinancialContext, Chat, Message, Vote)
│   └── scripts/                ← check-ads-tokens.mts + smoke scripts
├── patches/                    ← pnpm patches (@naviprotocol/lending)
└── pnpm-workspace.yaml
```

### Product catalog — Audric is exactly five products

> **S.18 reframe (April 19 2026 evening):** S.17 retired Audric Finance and tried to surface save/swap/borrow under Intelligence; S.18 brought Finance back because Intelligence was overloaded as both "the moat" and "the home for every financial verb," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive. Canonical reference: `t2000/audric-roadmap.md`.

| Product | What it is | Implementation | Status |
|---------|-----------|----------------|--------|
| 🪪 **Audric Passport** | Trust layer — zkLogin via Google, non-custodial Sui wallet, tap-to-confirm consent on every write, sponsored gas. Wraps every other product. | `@t2000/sdk` + Enoki + `@mysten/dapp-kit` | Live |
| 🧠 **Audric Intelligence** | Brain (the moat) — 4 systems orchestrate every money decision (Agent Harness · Reasoning Engine · Memory · AdviceLog; pre-Block-A had 5, MemWal absorbed Silent Profile + Chain Memory in 2026-05-21). Engineering-facing brand; users experience it as "Audric just understood me." | `@t2000/engine` 4.1.0 (26 tools, 12 guards post-S.277) + `@t2000/mcp` (8 skills as MCP prompts) + audric-side `record_advice` + silent context (`lib/audric/system-prompt.ts`, `<financial_context>` daily snapshot from `UserFinancialContext`) | Live |
| 💰 **Audric Finance** | Manage your money on Sui — Save (NAVI lend, 3–8% APY on USDC or USDsui — strategic exception per `savings-usdc-only`), Credit (NAVI borrow USDC or USDsui, health factor), Swap (Cetus aggregator, 20+ DEXs, 0.1% fee), Charts (yield/health/portfolio viz). Every write taps to confirm via Passport. | `@t2000/sdk` NAVI builders + `cetus-swap.ts` + `@t2000/engine` chart canvas templates | Live |
| 💸 **Audric Pay** | Money primitive — send USDC, receive via payment links / QR. Free, global, instant on Sui. (Invoicing collapsed into payment links — S.269.) | `@t2000/sdk` direct Sui tx + `@mysten/payment-kit` payment links | Live |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. AI-generated music/art/ebooks sold in USDC. 92% to creator. | `@t2000/sdk` + Walrus + payment links | Coming soon (Phase 5) |

### Silent intelligence (Audric Intelligence's silent context layer)

> The previous "Autonomous features" table (Copilot, scheduled actions, morning briefings, behavioral pattern proposals, trust ladder) was deleted in the April 2026 simplification — zkLogin can't sign without user presence, so "autonomous" was reminders dressed up as agency. See the S.0–S.12 entries in `t2000/audric-build-tracker.md`.

| Feature | Description | Status |
|---------|-------------|--------|
| **Memory (MemWal)** | `@mysten-incubation/memwal` Mysten vector memory. `prepareStep` hook recalls top-K facts each turn → `<memory_recall>` system-prompt block; `onFinish` callback calls `memwal.analyze()` to extract new facts post-turn. **Absorbs both former "Chain memory" and "Episodic memory" + replaces "Financial profile" inference.** Web-v2 only. | Live (v0.7d Phase 1+2) |
| **Advice log** | `record_advice` tool writes `AdviceLog`; `buildAdviceContext()` rehydrates last 30 days into every turn | Live |
| **Conversation log** | Full transcripts logged for the future self-hosted model migration | Live |
| ~~**Chain memory** (7 classifiers → `ChainFact`)~~ | Deleted in v0.7d Phase 6 Block A (S.221, 2026-05-21). `UserMemory.source='chain'` rows + 7 statistical classifiers + chain-memory cron all gone. MemWal absorbs chain signal organically from chat; LLM reads fresh chain state on demand via `transaction_history` / `activity_summary` / `spending_analytics`. | Removed |
| ~~**Episodic memory** (`UserMemory`)~~ | Deleted in v0.7d Phase 6 Block A (S.221, 2026-05-21). `UserMemory` Prisma table dropped; daily Claude memory-extraction cron deleted. Replaced by MemWal `analyze()` write path. | Removed |
| ~~**Financial profile** (`UserFinancialProfile`)~~ | Deleted in v0.7d Phase 6 Block A (S.221, 2026-05-21). `UserFinancialProfile` Prisma table dropped; daily Claude profile-inference cron deleted. MemWal absorbs preferences/risk signals as the user mentions them in chat. (Short-term daily `UserFinancialContext` snapshot — savings/wallet/debt/HF — is a DIFFERENT layer and is still live.) | Removed |
| ~~**Critical HF email**~~ | Removed in S.31 (2026-04-29). Stablecoin-only collateral + zkLogin tap-to-confirm makes proactive HF email net-negative UX vs surfacing HF prominently in chat. Zero proactive surfaces now. | Removed |

---

## Critical Rules

1. **Saves/borrows = USDC or USDsui only.** Send and swap support a wider asset set. See `.cursor/rules/usdc-only-saves.mdc`.
2. **Never add Invest or Swap as products.** Savings covers yield.
3. **Engine from npm.** Import `@t2000/engine` from npm — never copy engine code into this repo.
4. **Server Components by default.** Only add `'use client'` when needed.
5. **Check `developers.t2000.ai`** (Mintlify, the docs SSOT) before writing documentation or marketing copy. `PRODUCT_FACTS.md` was retired.
6. **Never read `process.env.X` directly.** Every server-side env access must go through the typed `env` proxy from `apps/web-v2/lib/env.ts`. The Zod schema runs at boot via `instrumentation.ts` and fails fast on misconfiguration. Direct reads bypass the gate that catches the empty-string-in-Vercel bug class (S.25 incident). New env var: add to schema first, then read via `env.X`. See `.cursor/rules/env-validation-gate.mdc`.
7. **Never break the resume contract.** When the engine yields `pending_action`, persist `attemptId` on `TurnMetrics` at chat-time. Resume is inline in `/api/chat` (the standalone `/api/engine/resume` route is gone): the client `addToolResult` round-trips the outcome on the next turn, and `/api/chat` runs `extractResumeOutcomes()` + `updateMany({ where: { attemptId } })`. Skipping `attemptId` orphans the action and the agent will offer to retry. See `.cursor/rules/write-tool-pending-action.mdc` + t2000's `agent-harness-spec.mdc`.
8. **Single source of truth for portfolio data.** Never re-implement balance / position / pricing fetches in route handlers — always go through `lib/portfolio.ts` (`getPortfolio`) and `lib/activity-data.ts`. Enforced today by convention + code review (the legacy `audric/canonical-portfolio` ESLint rule lived in archived `apps/web`; web-v2 uses Biome with no equivalent rule shipped yet — adding one is a worthwhile follow-up). See `.cursor/rules/audric-canonical-portfolio.mdc`.
9. **All writes are `permissionLevel: 'confirm'`.** No write tool ever auto-executes server-side under zkLogin. If you find yourself wanting `auto` for a write, you've broken the user-consent contract.

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@t2000/engine` | Agent engine — AISDKEngine (wraps Vercel AI SDK v6 `streamText`), tools, streaming, MCP |
| `@t2000/sdk` | Core SDK — wallet, balance, transactions, adapters |
| `@mysten/payment-kit` | Sui payment links / pay-URI client (USDC) |
| `@t2000/ui` | Geist DS token primitives (`@import "@t2000/ui/tokens"`) |
| `@mysten/sui` | Sui blockchain client |
| `@mysten/dapp-kit` | Wallet connection (zkLogin) |
| `@mysten-incubation/memwal` | Vector memory (long-term facts) |
| `@upstash/redis` | Session storage (Upstash KV) |

---

## Key Documents — read these before touching the corresponding area

> Internal-only docs — this repo's `HANDOFF_NEXT_AGENT.md`, plus `PRODUCT_ROADMAP.md`, `audric-build-tracker.md`, the `spec/` trees (referenced here as `t2000/...`), and engineer onboarding — are **not in any public repo.** They live in the private `mission69b/t2000-internal` repo, mounted at `t2000/spec/` (clone steps are in the founder's quick-start message; full onboarding at `t2000/spec/team-docs/ONBOARDING.md`). The usual paths resolve via gitignored symlinks once it's cloned.

| Document | What it covers | Read before |
|----------|---------------|-------------|
| `apps/web-v2/lib/env.ts` | Zod env schema + typed proxy. Single gate for every `process.env` read | Adding/changing env vars |
| `.cursor/rules/audric-transaction-flow.mdc` | Sponsored tx vs SDK direct — which path runs when, attemptId resume contract | Any write/receipt bug |
| `.cursor/rules/audric-canonical-portfolio.mdc` | Always go through `getCanonicalPortfolio` | Portfolio/wallet/positions read |
| `.cursor/rules/env-validation-gate.mdc` | The S.25 lesson — env via Zod, never raw `process.env` | Wiring a new env var |
| `.cursor/rules/zklogin-passport-flow.mdc` | The four pillars + ephemeral key lifecycle + MaxEpoch math | zkLogin / Passport changes |
| `.cursor/rules/safeguards-defense-in-depth.mdc` | Six layers of safety between user intent and on-chain action | Any change to a safety check |
| `.cursor/rules/prisma-models-overview.mdc` | What each of the 13 models is for, what owns it | Schema migrations / new tables |
| `.cursor/rules/write-tool-pending-action.mdc` | The pending_action → confirm → resume protocol | New write tool / receipt bug |
| `.cursor/rules/web-v2-chat-route-architecture.mdc` | Phase map of `apps/web-v2/app/api/chat/route.ts` (the 2,989-line nervous system) + AI SDK v6 conventions + Vercel AI Gateway + HITL inline resume | Touching the chat route or any `lib/audric/*` helper |
| `.cursor/rules/audric-context-assembly.mdc` | The audric-side content builders that feed each system-prompt layer (companion to t2000's `memory-injection-architecture.mdc`) | Adding/changing context layers |
| `.cursor/rules/audric-pay-flow.mdc` | send / payment-link / QR end-to-end (invoicing retired S.269) | Any Audric Pay change |
| `.cursor/rules/audric-finance-flow.mdc` | save / borrow / withdraw / swap / charts end-to-end | Any Audric Finance change |
| `.cursor/rules/cron-job-architecture.mdc` | t2000 cron → audric internal API contract + sharding | Cron / batch processing |
| `.cursor/rules/metrics-and-monitoring.mdc` | What's measured, where it's stored, how to read it | Adding new telemetry |
| `t2000/.cursor/rules/agent-harness-spec.mdc` | Spec 1 + Spec 2 (attemptId, TurnMetrics, modifiableFields, EngineConfig.onAutoExecuted) | Engine/resume integration |
| `t2000/.cursor/rules/blockvision-resilience.mdc` | Retry/backoff/circuit-breaker contract | BlockVision integration changes |

---

## Engine Integration

### Delegated execution flow

```
User types message
  → POST /api/chat (SSE stream) — daily-free billing gate (5 unverified / 20 verified per rolling 24h)
  → system-prompt assembly: <memory_recall> (MemWal) + <financial_context> + advice context (all silent)
  → Experimental_Agent (AI SDK v6) → Claude with 26 tools (18 read + 8 write, engine 4.1.0; BlockVision-backed pricing via `token_prices` / `balance_check` / `portfolio_analysis`)
  → Read tools (balance, savings, health, analytics) → auto-executed server-side
  → Write tools (save, withdraw, send) → pending_action event
  → Client displays PermissionCard
  → Client executes transaction on-chain (zkLogin + Enoki gas) → addToolResult
  → Next /api/chat turn carries the outcome → inline resume (extractResumeOutcomes + updateMany)
  → Engine continues conversation with result
```

### Canvas delivery flow

```
Engine emits render_canvas tool result (template id + data)
  → arrives as a tool-result UIMessage part
  → ToolResultRouter → CanvasCard → CanvasTemplateRenderer (React)
  → Canvas components in components/audric/cards/canvas/
```

### Internal API routes

`/api/internal/payments` is the SOLE surviving internal route (the scheduled-action / briefing / outcome-check / follow-up / anomaly-detect routes were all deleted in the April 2026 + v0.7d/v0.7e cleanups):
- Authenticated via `x-internal-key` header matching `T2000_INTERNAL_KEY` env var
- Called server-side by the engine's payment-link tools (server-to-server only); rejects `type: 'invoice'` with 410 Gone

### Engine imports

```ts
import { AISDKEngine, getDefaultTools } from '@t2000/engine';
// [engine v2.2.0 / SPEC 37 v0.7a Phase 5 Slice A] `engineToSSE` removed —
// chat + resume routes iterate EngineEvent raw and call `serializeSSE`
// per event (the v1.4.2 / Spec G3 pattern, now the only pattern). Hosts
// that want SPEC 21.1 routing/quoting/etc → stream_state choreography
// wrap with `withStreamState` directly.
import { serializeSSE, parseSSE, withStreamState } from '@t2000/engine';
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';
import { classifyEffort, ContextBudget } from '@t2000/engine';
// [v0.7d Phase 6 Block A — 2026-05-21] `buildMemoryContext` was deleted
// from web-v2 alongside the `UserMemory` Prisma table. `buildProfileContext`
// is still exported by @t2000/engine but only consumed by apps/web (v0.7e
// archive target); web-v2 uses MemWal `<memory_recall>` via prepareStep.
import { runGuards, applyToolFlags } from '@t2000/engine';
import type { PendingAction, EngineEvent, SSEEvent } from '@t2000/engine';
```

### Engine event types

```ts
type EngineEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_done' }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'pending_action'; action: PendingAction }
  | { type: 'canvas'; html: string }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; error: Error };
```

---

## Multi-wallet linking — RETIRED

> **🗑️ REMOVED in v0.7e Phase 5 (S.254, 2026-05-22):** the entire multi-wallet aggregation feature (`/api/user/wallets`, `/api/user/wallets/[id]`, `/api/analytics/portfolio-multi`, `LinkedWallet` Prisma model + 3 indexes, `FullPortfolioCanvas` aggregated-portfolio surface) was retired. The current zkLogin flow is single-wallet-per-Google-account by construction — one zkLogin = one Sui address (deterministic from JWT `sub`); multi-wallet was a holdover from pre-zkLogin patterns that no production user exercised. If a future multi-account product surface is needed (e.g., personal + business separation), revisit as a fresh design that respects the zkLogin identity binding.

> **Removed in S.22 (April 2026):** the public `/report/[address]` wallet report (and its `PublicReport` cache). The "Audric would do" suggestions there were promoting features deleted in S.0–S.12 (24/7 alerts, recurring transactions, savings-goal automation), and a second standalone product surface contradicted the chat-first thesis. Heuristic portfolio analysis lives inside chat now via `portfolio_analysis` + `health_check`.
>
> **Update (S.103, SPEC 17, May 2026):** the broader savings-goal layer is now fully removed — `SavingsGoal` Prisma table, 4 `savings_goal_*` engine tools, `GoalsPanel` settings/dashboard surface, `openGoals` snapshot field, and the heuristic prompt line that nudged "your goal is off-track". Conversational goals ("I want to save $500 by May") are still observable by the agent via memory + `goal_progress` proactive markers, but there is no structured persistence layer. Track savings progress via `health_check` + `portfolio_analysis` + `yield_summary`.

---

## Auth: zkLogin + Enoki

- Google OAuth → JWT → ephemeral Ed25519 keypair → ZK proof → deterministic Sui address
- No private key, no seed phrase — wallet derived from Google JWT
- Ephemeral keys are session-scoped, never persisted to server
- All transactions gas-free via Enoki sponsorship

---

## Unified Data Layer

Two centralized modules that aggregate all financial data. Used by API routes, canvases, and engine context assembly.

| Module | Location | What it provides |
|--------|----------|------------------|
| `portfolio.ts` | `lib/portfolio.ts` | Wallet balances, NAVI positions (savings + borrows), DeFi positions, total portfolio value, historical snapshots. `getPortfolio(address)` is the canonical fetcher. Delegates NAVI lending state to the internal `lib/navi-positions.ts` helper. |
| `activity-data.ts` | `lib/activity-data.ts` | App events (Prisma), on-chain transactions (Sui JSON-RPC), merged + sorted timeline |

Always fetch through these modules — never query wallet/NAVI/events directly in route handlers.

---

## Silent intelligence layer (post-v0.7d Phase 6 Block A)

**web-v2 (production):** assembled in `app/api/chat/route.ts` (the `Experimental_Agent` setup) and injected into the engine system prompt each turn. Everything below is silent — no notifications, no surfaces, no proactive nudges.

| Feature | What it does |
|---------|-------------|
| **Memory (MemWal)** | `prepareStep` hook calls `memwal.recall(latestUserMessage)` and injects `<memory_recall>` block into the system prompt. `onFinish` callback calls `memwal.analyze()` to extract new facts. Replaces both former `UserFinancialProfile` and `UserMemory` Prisma reads. See `lib/audric/memwal-prepare-step.ts` + `lib/audric/memwal-write-callback.ts`. |
| **Financial Context** | `UserFinancialContext` Prisma model: short-term daily orientation snapshot (savings/wallet/debt USD, health factor, current APY, recent activity). 02:30 UTC Vercel cron refresh (`/api/cron/financial-context-snapshot`). Injected as `<financial_context>` system-prompt block. **Different from the deleted `UserFinancialProfile` — this is fresh state, not inferred preferences.** |
| **Chat Persistence** | `Chat` + `Message` + `Vote` Prisma triple (AI SDK v6 native, post-S.247). Per-message `UIMessage` JSON rows scoped to a parent thread; `Vote` carries per-message thumbs up/down. Used as the future fine-tune dataset (same purpose the deleted `ConversationLog` table served pre-S.254). |
| **Advice Memory** | `record_advice` engine tool writes `AdviceLog` rows; `buildAdviceContext()` rehydrates last 30 days into every turn |

> **Deleted in v0.7d Phase 6 Block A (S.221, 2026-05-21):** `UserMemory` table + `UserFinancialProfile` table + `ChainFact` rows in UserMemory + the 7 statistical chain classifiers + `buildMemoryContext` + `buildProfileContext` consumers in web-v2. MemWal now owns the long-term memory layer end-to-end. See `t2000/audric-build-tracker.md` S.221.

> **Deleted in v0.7e Phase 5 cleanup (S.254, 2026-05-22):** `ConversationLog` Prisma table (superseded by AI SDK v6 native `Chat`/`Message`/`Vote` per S.247) + its retention cron route. `LinkedWallet` + `WatchAddress` Prisma tables (multi-wallet aggregation + watch-only features retired). `UserPreferences.contacts` column (contacts feature retired in S.243). All migrations consolidated into `prisma/migrations/20260522120000_v07e_drop_dead_tables_and_columns/migration.sql`.

> **apps/web ARCHIVED (S.253, 2026-05-22):** the entire `apps/web` directory was deleted from the monorepo after DNS cutover moved `audric.ai` to point at the `audric-web-v2` Vercel project. The marketing-site copy + legal pages + chat shell + cron routes were either copy-ported to `apps/web-v2` (during v0.7c Phase 6 cutover) or absorbed by web-v2's superior architecture (engine read tools are in-process; HITL flow is inline in `app/api/chat/route.ts`). Legacy `lib/engine/*` helpers (`engine-context.ts`, `apply-modifications.ts`, `harness-metrics.ts`, `log-session-usage.ts`, `cost-rates.ts`, `advice-tool.ts`, `goal-tools.ts`, `contact-tools.ts`, `init-engine-stores.ts`) are gone.

> The "F2 — Proactive Awareness" / `OutcomeCheck` / follow-up-queue layer was deleted in S.5 — anything proactive was either a notification (gone) or a dashboard card (gone). The chat answers when asked.

---

## Rich Cards + Canvas

### Rich cards (17 components)

Located in `components/audric/cards/`. Rendered client-side based on `toolName` in `tool_result` events. Registered via `tool-result-router.tsx`.

Examples: `BalanceCardV2` (per-asset wallet + NAVI savings/debt), `SavingsCard`, `HealthCardV2`, `RatesCardV2`, `PriceCard`, `SwapQuoteCardV2`, `TransactionReceiptCard`, `TransactionHistoryCard`, `PendingRewardsCardV2`, `YieldEarningsCard`, `ActivitySummaryCard`, `PaymentLinkCard`, `ExplainTxCard`, `PortfolioCardV2`. (StakingCard / ProtocolCard retired with their engine tools — S.277.)

### Canvas visualizations

Located in `components/audric/cards/canvas/`. Rendered as React via `CanvasTemplateRenderer` (routed through `ToolResultRouter` → `CanvasCard` from the `render_canvas` tool-result part).

Examples: portfolio timeline, activity heatmap, spending breakdown, yield projector, health simulator, watch list, full portfolio dashboard, receive address, DCA planner.

---

## Tooling

- **Package manager:** pnpm (v10.6.2)
- **Build:** Turbo
- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v4 + Geist Design System (shadcn primitives, Geist-rooted tokens — see `design-system.mdc`)
- **State:** TanStack Query / SWR + custom hooks
- **Database:** NeonDB (Prisma) — 13 models (see `prisma-models-overview.mdc`)
- **Sessions:** Upstash Redis (KV)
- **Lint/format:** Biome via ultracite
- **Testing:** Vitest

### Commands

```bash
pnpm dev          # Start dev server (Turbo, port 3001)
pnpm build        # Production build (prisma migrate deploy && next build)
pnpm lint         # Biome via ultracite (`ultracite check`)
pnpm check:ads    # Guard against legacy ADS-token reintroduction
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm test         # Run tests (Vitest)
```

---

## Styling — Geist Design System

Source of truth: `apps/web-v2/app/globals.css`. Prototype reference: `t2000-AFI/audric/phase2-*.html` (founder-local). The legacy Agentic Design System (ADS) was decommissioned in R6.9 (2026-05-30) and the whole app rebuilt onto Geist DS (Rock 6 of `SPEC_MARKETING_SITE_REDESIGN.md`).

**The canonical day-to-day rules live in `.cursor/rules/design-system.mdc`** (kept in sync with this section — read it before building any component). Summary:

- **Tokens** — Geist-rooted shadcn semantic set: `bg-background` / `text-foreground`, `bg-card`, `bg-muted` / `text-muted-foreground`, `border-border`, `bg-primary`, `text-destructive`, `text-success` / `bg-warning` / `text-info`, `ring-ring`, `bg-sidebar*`. Plus Audric's single signal accent (`text-signal` / `bg-signal` / `bg-signal-bg`, cyan, signal-only). Geist ramps (`var(--ds-gray-*)`, `var(--ds-blue-700)`, …) when no shadcn token fits. **No raw hex, no Tailwind defaults, no removed ADS tokens** (`surface-*`, `fg-*`, `border-default|subtle|focus`, `*-fg|bg|border|solid`, `.ads-*`) — `pnpm check:ads` fails CI on reintroduction.
- **Fonts** — Geist + Geist Mono only (New York + Departure Mono stripped in R6.4). `font-sans` + `font-serif` both resolve to Geist; `font-mono` → Geist Mono. Loaded via `next/font/google` in `app/layout.tsx`.
- **Theming** — `next-themes` dual attribute (`["class", "data-theme"]`). Geist flips the ramp automatically via `data-theme`; the `.dark` class drives the `dark:` variant + shadow/signal overrides. **Prefer letting tokens flip automatically**; reach for `dark:` only when a token can't express a value. Default theme is `light`; toggle in Settings → Appearance.

### Conventions

- Group utilities: layout → spacing → sizing → colors → effects.
- `cn()` for conditional classes.
- Marketing/landing components live under `components/landing/`.

---

## TypeScript Conventions

- Strict mode, avoid `any` — use `unknown` + type guards
- Components: `PascalCase.tsx`, named exports, destructured props
- Hooks: `useCamelCase`, return objects for multiple values
- Props: `interface FooProps`
- Booleans: `is`, `has`, `should`, `can` prefix
- Event handlers: `handleEventName` or `onEventName` prop

---

## Git Commits

```
emoji type(scope): subject
```

| Type | Emoji |
|------|-------|
| feat | ✨ |
| fix | 🐛 |
| docs | 📝 |
| style | 🎨 |
| refactor | ♻️ |
| perf | ⚡ |
| test | ✅ |
| build | 📦 |
| chore | 🔧 |

- Subject lowercase, ALWAYS use emoji
- Do NOT add "Generated with Claude"
- Scopes: `auth`, `dashboard`, `engine`, `api`, `ui`

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUI_NETWORK` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `NEXT_PUBLIC_ENOKI_API_KEY` | Enoki (zkLogin) API key |
| `NEXT_PUBLIC_APP_URL` | Public app URL (e.g. `https://audric.ai`) |
| `NEXT_PUBLIC_MPP_GATEWAY_URL` | MPP gateway URL (`https://mpp.t2000.ai`) |
| `DATABASE_URL` | NeonDB Postgres connection string |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `KV_REST_API_URL` | Upstash Redis URL |
| `KV_REST_API_TOKEN` | Upstash Redis token |
| `T2000_INTERNAL_KEY` | Shared secret for internal API route authentication (cron jobs) |

### Optional

| Variable | Description |
|----------|-------------|
| `ENABLE_THINKING` | Enable extended thinking / reasoning accordion (`true`/`false`) |
| `AGENT_MODEL` | Override Anthropic model (default: `claude-sonnet-4-20250514`) |

---

## Links

| Resource | URL |
|----------|-----|
| Audric (consumer) | `audric.ai` |
| t2000 (infra) | `t2000.ai` |
| suimpp (protocol) | `suimpp.dev` |
| MPP Gateway | `mpp.t2000.ai` |
| Engine npm | `npmjs.com/package/@t2000/engine` |
