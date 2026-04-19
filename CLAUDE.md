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
├── apps/web/                   ← audric.ai (Next.js, Vercel)
│   ├── app/                    ← App Router pages + API routes (75+ routes, 20 internal)
│   │   └── report/             ← Public wallet intelligence report (/report, /report/[address])
│   ├── components/             ← UI components (auth, dashboard, engine, settings, ui)
│   │   └── engine/cards/       ← 21 rich card components + 8 canvas components
│   ├── hooks/                  ← React hooks (useEngine, useBalance, useChipFlow, etc.)
│   ├── lib/                    ← Utilities, types, constants
│   │   ├── engine/             ← engine-factory.ts, engine-context.ts (silent context assembly)
│   │   ├── report/             ← Report generator, analyzers, types (public wallet reports)
│   │   ├── chain-memory/       ← Chain classifiers (silent context only — proposal pipeline removed S.5)
│   │   ├── portfolio-data.ts   ← Unified portfolio data (wallet + positions + snapshots)
│   │   └── activity-data.ts    ← Unified activity data (app events + chain txs)
│   ├── prisma/                 ← 15 models (users, profiles, memories, advice log, conversation log, goals, contacts, payments, app events)
│   └── types/                  ← TypeScript type definitions
├── patches/                    ← pnpm patches (@naviprotocol/lending)
└── pnpm-workspace.yaml
```

### Product catalog — Audric is exactly five products

> **S.18 reframe (April 19 2026 evening):** S.17 retired Audric Finance and tried to surface save/swap/borrow under Intelligence; S.18 brought Finance back because Intelligence was overloaded as both "the moat" and "the home for every financial verb," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive. Canonical reference: `t2000/audric-roadmap.md`.

| Product | What it is | Implementation | Status |
|---------|-----------|----------------|--------|
| 🪪 **Audric Passport** | Trust layer — zkLogin via Google, non-custodial Sui wallet, tap-to-confirm consent on every write, sponsored gas. Wraps every other product. | `@t2000/sdk` + Enoki + `@mysten/dapp-kit` | Live |
| 🧠 **Audric Intelligence** | Brain (the moat) — 5 systems orchestrate every money decision. Engineering-facing brand; users experience it as "Audric just understood me." | `@t2000/engine` (40 tools, reasoning, guards, recipes) + audric-side `record_advice` + silent context (`engine-context.ts`) | Live |
| 💰 **Audric Finance** | Manage your money on Sui — Save (NAVI lend, 3–8% APY USDC), Credit (NAVI borrow, health factor), Swap (Cetus aggregator, 20+ DEXs, 0.1% fee), Charts (yield/health/portfolio viz). Every write taps to confirm via Passport. | `@t2000/sdk` NAVI builders + `cetus-swap.ts` + `@t2000/engine` chart canvas templates + audric `/api/internal/*` read endpoints | Live |
| 💸 **Audric Pay** | Money primitive — send USDC, receive via payment links / invoices / QR. Free, global, instant on Sui. | `@t2000/sdk` direct Sui tx + payment-link contract + invoice flows | Live |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. AI-generated music/art/ebooks sold in USDC. 92% to creator. | `@t2000/sdk` + Walrus + payment links | Coming soon (Phase 5) |

Plus one public tool (no sign-up):

| Tool | Where | Status |
|------|-------|--------|
| **Wallet Report** | `audric.ai/report/[address]` — heuristic portfolio analysis, yield efficiency, risk signals (no LLM) | Live |

### Silent intelligence (Audric Intelligence's silent context layer)

> The previous "Autonomous features" table (Copilot, scheduled actions, morning briefings, behavioral pattern proposals, trust ladder) was deleted in the April 2026 simplification — zkLogin can't sign without user presence, so "autonomous" was reminders dressed up as agency. See the S.0–S.12 entries in `t2000/audric-build-tracker.md`.

| Feature | Description | Status |
|---------|-------------|--------|
| **Chain memory** | 7 on-chain classifiers (AppEvent + PortfolioSnapshot → `ChainFact`); fed silently into agent context, never surfaced | Live |
| **Episodic memory** | `UserMemory` extracted from chat transcripts by Claude (50-cap, Jaccard dedup) | Live |
| **Financial profile** | `UserFinancialProfile` (risk tolerance, goals, horizon) inferred by Claude — silent calibration | Live |
| **Advice log** | `record_advice` tool writes `AdviceLog`; `buildAdviceContext()` rehydrates last 30 days into every turn | Live |
| **Conversation log** | Full transcripts logged for the future self-hosted model migration | Live |
| **Critical HF email** | Real-time indexer hook → Resend when HF < 1.2 (liquidation imminent). Always on, the only proactive surface | Live |

---

## Critical Rules

1. **USDC only for saves/borrows.** Send and swap support all Tier 2 assets. See `.cursor/rules/usdc-only-saves.mdc`.
2. **Never add Invest or Swap as products.** Savings covers yield.
3. **Engine from npm.** Import `@t2000/engine` from npm — never copy engine code into this repo.
4. **Server Components by default.** Only add `'use client'` when needed.
5. **Check t2000 PRODUCT_FACTS.md** before writing documentation or marketing copy.

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@t2000/engine` | Agent engine — QueryEngine, tools, streaming, MCP |
| `@t2000/sdk` | Core SDK — wallet, balance, transactions, adapters |
| `@suimpp/mpp` | MPP payment client (Sui USDC) |
| `@mysten/sui` | Sui blockchain client |
| `@mysten/dapp-kit` | Wallet connection (zkLogin) |
| `@upstash/redis` | Session storage (Upstash KV) |

---

## Engine Integration

### Delegated execution flow

```
User types message
  → POST /api/engine/chat (SSE stream) — daily-free billing gate (5 unverified / 20 verified per rolling 24h)
  → engine-context.ts: buildFullDynamicContext() → injects profile, memory, advice log, chain facts (all silent)
  → engine-factory.ts: QueryEngine → AnthropicProvider → Claude with 40 tools (29 read + 11 write)
  → Read tools (balance, savings, health, analytics) → auto-executed server-side
  → Write tools (save, withdraw, send) → pending_action event
  → Client displays confirmation card
  → Client executes transaction on-chain (zkLogin + Enoki gas)
  → POST /api/engine/resume with execution result
  → Engine continues conversation with result
```

### Canvas delivery flow

```
Engine emits render_canvas tool_result with HTML
  → SSE: { type: 'canvas', html: '...' }
  → Client renders inside <iframe srcDoc={html} />
  → Canvas components in components/engine/cards/canvas/
```

### Internal API routes

20 routes under `/api/internal/` called by t2000 server cron jobs:
- Authenticated via `x-internal-key` header matching `T2000_INTERNAL_KEY` env var
- Examples: `execute-schedule`, `morning-briefing`, `outcome-check`, `follow-up`, `anomaly-detect`
- Never called from browser — server-to-server only

### Engine imports

```ts
import { QueryEngine, AnthropicProvider, getDefaultTools } from '@t2000/engine';
import { serializeSSE, parseSSE, engineToSSE } from '@t2000/engine';
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';
import { classifyEffort, ContextBudget, RecipeRegistry } from '@t2000/engine';
import { runGuards, applyToolFlags, buildProfileContext, buildMemoryContext } from '@t2000/engine';
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

## Public Wallet Report (`/report`)

Public acquisition funnel — analyze any Sui wallet with no sign-up required.

### Routes

| Route | Runtime | Auth | Description |
|-------|---------|------|-------------|
| `/report` | Client | None | Landing page with address input + example addresses |
| `/report/[address]` | Server + Client | None | Report page (SSR metadata + client-side fetch) |
| `/report/[address]/opengraph-image` | Edge | None | Dynamic OG image (1200×630) |
| `/api/report/[address]` | Node.js | Rate limited (5/hr/IP) | Report generation + 24h Prisma cache |
| `/api/analytics/portfolio-multi` | Node.js | x-sui-address | Aggregated multi-wallet portfolio data |
| `/api/user/wallets` | Node.js | x-zklogin-jwt | Link/unlink wallets (max 10 per user) |

### Report data flow

```
GET /api/report/[address]
  → Rate limit check (Upstash, bypass via x-internal-secret for OG images)
  → Cache lookup (PublicReport, 24h TTL)
  → On miss: generateWalletReport(address)
    → Promise.all: fetchWalletBalances + fetchPositions + fetchActivityBuckets
    → buildPortfolioSection → buildYieldEfficiency → buildActivitySection
    → detectPatterns (5) + detectRiskSignals (3) + generateSuggestions (4)
  → Cache store + return WalletReportData
```

### Key files

| File | Purpose |
|------|---------|
| `lib/report/types.ts` | `WalletReportData` interface (portfolio, yield, activity, patterns, risks, suggestions) |
| `lib/report/generator.ts` | Orchestrates parallel data fetching + report assembly |
| `lib/report/analyzers.ts` | Pure heuristic functions — no LLM calls |
| `app/report/[address]/ReportPageClient.tsx` | Full report UI with 8 sections + share mechanics |

### Prisma models

- `LinkedWallet` — userId, suiAddress, label, isPrimary, verifiedAt
- `PublicReport` — suiAddress, reportData (Json), viewCount, expiresAt

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
| `portfolio-data.ts` | `lib/portfolio-data.ts` | Wallet balances, NAVI positions (savings + borrows), total portfolio value, historical snapshots |
| `activity-data.ts` | `lib/activity-data.ts` | App events (Prisma), on-chain transactions (Sui JSON-RPC), merged + sorted timeline |

Always fetch through these modules — never query wallet/NAVI/events directly in route handlers.

---

## Silent intelligence layer (post-simplification)

Assembled in `lib/engine/engine-context.ts` via `buildFullDynamicContext()` and injected into the engine system prompt each turn. Everything below is silent — no notifications, no surfaces, no proactive nudges.

| Feature | What it does |
|---------|-------------|
| **Financial Profile** | `UserFinancialProfile` Prisma model: risk tolerance, goals, income bracket, investment horizon. Calibrates tone + recommendations |
| **Episodic Memory** | `UserMemory` Prisma model: key facts, preferences, past decisions remembered across sessions |
| **Conversation Log** | `ConversationLog` records full chat transcripts — fine-tuning dataset for the future self-hosted model migration |
| **Advice Memory** | `record_advice` engine tool writes `AdviceLog` rows; `buildAdviceContext()` rehydrates last 30 days into every turn |
| **Chain Facts** | `ChainFact` rows produced by 7 chain-memory classifiers, surfaced as `[on-chain observation]` lines in the system prompt |

> The "F2 — Proactive Awareness" / `OutcomeCheck` / follow-up-queue layer was deleted in S.5 — anything proactive was either a notification (gone) or a dashboard card (gone). The chat answers when asked.

---

## Rich Cards + Canvas

### Rich cards (21 components)

Located in `components/engine/cards/`. Rendered client-side based on `toolName` in `tool_result` events. Registered in `cards/index.ts` via `CARD_RENDERERS` map.

Examples: `SavingsCard`, `BalanceCard`, `StakingCard`, `ProtocolCard`, `PriceCard`, `HealthCard`, `TransactionReceiptCard`, `SpendingCard`, `YieldCard`

### Canvas visualizations (8 components)

Located in `components/engine/cards/canvas/`. Rendered inside `<iframe srcDoc>` from `canvas` SSE events.

Examples: portfolio timeline, activity heatmap, spending breakdown, net worth chart, yield comparison, protocol overview

---

## Tooling

- **Package manager:** pnpm (v10.6.2)
- **Build:** Turbo
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS v4 + shadcn/ui patterns
- **State:** TanStack Query + custom hooks
- **Database:** NeonDB (Prisma) — 15+ models (users, profiles, memories, goals, schedules, analytics, briefings, conversations, events)
- **Sessions:** Upstash Redis (KV)
- **Testing:** Vitest + React Testing Library

### Commands

```bash
pnpm dev          # Start dev server (Turbo)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm test         # Run tests (Vitest)
```

---

## Styling — Agentic Design System

- **Fonts:** Geist Sans (body), Geist Mono (code/labels), Instrument Serif (display)
- **Colors:** White/black neutrals (N100–N900), no brand accent color
- **Semantic:** `--success` green, `--error` red, `--warning` amber, `--info` blue
- **Buttons:** `bg-foreground text-background` (black on white)
- **User messages:** Inverted (dark bubble, light text)
- Group utilities: layout → spacing → sizing → colors → effects
- `cn()` for conditional classes

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
| `RESEND_API_KEY` | Email delivery (Resend) for payment links, invoices |

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
