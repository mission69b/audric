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
│   ├── components/             ← UI components (auth, dashboard, engine, settings, ui)
│   │   └── engine/cards/       ← 21 rich card components + 8 canvas components
│   ├── hooks/                  ← React hooks (useEngine, useBalance, useChipFlow, etc.)
│   ├── lib/                    ← Utilities, types, constants
│   │   ├── engine/             ← engine-factory.ts, engine-context.ts (silent context assembly)
│   │   ├── chain-memory/       ← Chain classifiers (silent context only — proposal pipeline removed S.5)
│   │   ├── portfolio-data.ts   ← Unified portfolio data (wallet + positions + snapshots)
│   │   └── activity-data.ts    ← Unified activity data (app events + chain txs)
│   ├── prisma/                 ← 16 models (users, profiles, memories, financial context, advice log, conversation log, session usage, goals, contacts, payments, watch addresses, linked wallets, portfolio snapshots, turn metrics, app events, service purchases)
│   └── types/                  ← TypeScript type definitions
├── patches/                    ← pnpm patches (@naviprotocol/lending)
└── pnpm-workspace.yaml
```

### Product catalog — Audric is exactly five products

> **S.18 reframe (April 19 2026 evening):** S.17 retired Audric Finance and tried to surface save/swap/borrow under Intelligence; S.18 brought Finance back because Intelligence was overloaded as both "the moat" and "the home for every financial verb," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive. Canonical reference: `t2000/audric-roadmap.md`.

| Product | What it is | Implementation | Status |
|---------|-----------|----------------|--------|
| 🪪 **Audric Passport** | Trust layer — zkLogin via Google, non-custodial Sui wallet, tap-to-confirm consent on every write, sponsored gas. Wraps every other product. | `@t2000/sdk` + Enoki + `@mysten/dapp-kit` | Live |
| 🧠 **Audric Intelligence** | Brain (the moat) — 5 systems orchestrate every money decision. Engineering-facing brand; users experience it as "Audric just understood me." | `@t2000/engine` (34 tools, reasoning, guards, recipes) + audric-side `record_advice` + silent context (`engine-context.ts`, `<financial_context>` daily snapshot from `UserFinancialContext`) | Live |
| 💰 **Audric Finance** | Manage your money on Sui — Save (NAVI lend, 3–8% APY USDC), Credit (NAVI borrow, health factor), Swap (Cetus aggregator, 20+ DEXs, 0.1% fee), Charts (yield/health/portfolio viz). Every write taps to confirm via Passport. | `@t2000/sdk` NAVI builders + `cetus-swap.ts` + `@t2000/engine` chart canvas templates + audric `/api/internal/*` read endpoints | Live |
| 💸 **Audric Pay** | Money primitive — send USDC, receive via payment links / invoices / QR. Free, global, instant on Sui. | `@t2000/sdk` direct Sui tx + payment-link contract + invoice flows | Live |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. AI-generated music/art/ebooks sold in USDC. 92% to creator. | `@t2000/sdk` + Walrus + payment links | Coming soon (Phase 5) |

### Silent intelligence (Audric Intelligence's silent context layer)

> The previous "Autonomous features" table (Copilot, scheduled actions, morning briefings, behavioral pattern proposals, trust ladder) was deleted in the April 2026 simplification — zkLogin can't sign without user presence, so "autonomous" was reminders dressed up as agency. See the S.0–S.12 entries in `t2000/audric-build-tracker.md`.

| Feature | Description | Status |
|---------|-------------|--------|
| **Chain memory** | 7 on-chain classifiers (AppEvent + PortfolioSnapshot → `ChainFact`); fed silently into agent context, never surfaced | Live |
| **Episodic memory** | `UserMemory` extracted from chat transcripts by Claude (50-cap, Jaccard dedup) | Live |
| **Financial profile** | `UserFinancialProfile` (risk tolerance, goals, horizon) inferred by Claude — silent calibration | Live |
| **Advice log** | `record_advice` tool writes `AdviceLog`; `buildAdviceContext()` rehydrates last 30 days into every turn | Live |
| **Conversation log** | Full transcripts logged for the future self-hosted model migration | Live |
| ~~**Critical HF email**~~ | Removed in S.31 (2026-04-29). Stablecoin-only collateral + zkLogin tap-to-confirm makes proactive HF email net-negative UX vs surfacing HF prominently in chat. Zero proactive surfaces now. | Removed |

---

## Critical Rules

1. **USDC only for saves/borrows.** Send and swap support all Tier 2 assets. See `.cursor/rules/usdc-only-saves.mdc`.
2. **Never add Invest or Swap as products.** Savings covers yield.
3. **Engine from npm.** Import `@t2000/engine` from npm — never copy engine code into this repo.
4. **Server Components by default.** Only add `'use client'` when needed.
5. **Check t2000 PRODUCT_FACTS.md** before writing documentation or marketing copy.
6. **Never read `process.env.X` directly.** Every server-side env access must go through the typed `env` proxy from `apps/web/lib/env.ts`. The Zod schema runs at boot via `instrumentation.ts` and fails fast on misconfiguration. Direct reads bypass the gate that catches the empty-string-in-Vercel bug class (S.25 incident). New env var: add to schema first, then read via `env.X`. See `.cursor/rules/env-validation-gate.mdc`.
7. **Never break the resume contract.** When the engine yields `pending_action`, persist `attemptId` on `TurnMetrics`, then on execute success call `/api/agent/resume` with `{ attemptId, txDigest, balanceChanges }`. Skipping `attemptId` orphans the action and the agent will offer to retry. See `.cursor/rules/audric-transaction-flow.mdc` + t2000's `agent-harness-spec.mdc`.
8. **Single source of truth for portfolio data.** Never re-implement balance / position / pricing fetches in route handlers — always go through `lib/portfolio-data.ts` (`getCanonicalPortfolio`) and `lib/activity-data.ts`. ESLint enforces this. See `.cursor/rules/audric-canonical-portfolio.mdc`.
9. **All writes are `permissionLevel: 'confirm'`.** No write tool ever auto-executes server-side under zkLogin. If you find yourself wanting `auto` for a write, you've broken the user-consent contract.

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

## Key Documents — read these before touching the corresponding area

| Document | What it covers | Read before |
|----------|---------------|-------------|
| `apps/web/lib/env.ts` | Zod env schema + typed proxy. Single gate for every `process.env` read | Adding/changing env vars |
| `PORTFOLIO_REGRESSION_MATRIX.md` | Manual SSOT verification checklist across surfaces | Post-merge SSOT verification |
| `.cursor/rules/audric-transaction-flow.mdc` | Sponsored tx vs SDK direct — which path runs when, attemptId resume contract | Any write/receipt bug |
| `.cursor/rules/audric-canonical-portfolio.mdc` | Always go through `getCanonicalPortfolio` | Portfolio/wallet/positions read |
| `.cursor/rules/env-validation-gate.mdc` | The S.25 lesson — env via Zod, never raw `process.env` | Wiring a new env var |
| `.cursor/rules/zklogin-passport-flow.mdc` | The four pillars + ephemeral key lifecycle + MaxEpoch math | zkLogin / Passport changes |
| `.cursor/rules/safeguards-defense-in-depth.mdc` | Six layers of safety between user intent and on-chain action | Any change to a safety check |
| `.cursor/rules/prisma-models-overview.mdc` | What each of the 16 models is for, what owns it | Schema migrations / new tables |
| `.cursor/rules/write-tool-pending-action.mdc` | The pending_action → confirm → resume protocol | New write tool / receipt bug |
| `.cursor/rules/engine-context-assembly.mdc` | What goes into the system prompt each turn (silent context) | Adding/changing context layers |
| `.cursor/rules/audric-pay-flow.mdc` | send / payment-link / invoice / QR end-to-end | Any Audric Pay change |
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
  → POST /api/engine/chat (SSE stream) — daily-free billing gate (5 unverified / 20 verified per rolling 24h)
  → engine-context.ts: buildFullDynamicContext() → injects profile, memory, advice log, chain facts (all silent)
  → engine-factory.ts: QueryEngine → AnthropicProvider → Claude with 34 tools (23 read + 11 write, BlockVision-backed pricing via `token_prices` / `balance_check` / `portfolio_analysis`)
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

## Multi-wallet linking

Signed-in users can link up to 10 Sui addresses (e.g. a hardware wallet alongside their zkLogin wallet) for aggregated portfolio views inside the chat canvas + settings.

| Route | Runtime | Auth | Description |
|-------|---------|------|-------------|
| `/api/user/wallets` (GET / POST) | Node.js | x-zklogin-jwt | List + link wallets (max 10 per user) |
| `/api/user/wallets/[id]` (DELETE) | Node.js | x-zklogin-jwt | Unlink a wallet |
| `/api/analytics/portfolio-multi` | Node.js | x-sui-address | Aggregated multi-wallet portfolio data (consumed by `FullPortfolioCanvas`) |

Backed by the `LinkedWallet` Prisma model (`userId`, `suiAddress`, `label`, `isPrimary`, `verifiedAt`).

> **Removed in S.22 (April 2026):** the public `/report/[address]` wallet report (and its `PublicReport` cache). The "Audric would do" suggestions there were promoting features deleted in S.0–S.12 (24/7 alerts, recurring transactions, savings-goal automation), and a second standalone product surface contradicted the chat-first thesis. Heuristic portfolio analysis lives inside chat now via `portfolio_overview` + `health_check`.

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

## Styling — Audric Design System v1.2 (light + dark)

Source of truth: `apps/web/app/globals.css` + `design_handoff_audric/design_files/colors_and_type.css`.
The full handoff lives in `design_handoff_audric/`. Implementation history:
- `IMPLEMENTATION_PLAN.md` — dark-mode build plan (Phases 1–6 + post-launch revisions)
- `IMPLEMENTATION_PLAN_PHASES_1_14_LIGHT_MARKETING.md` — light theme + marketing reskin (Phases 1–14)

See also: `.cursor/rules/design-system.mdc` for the day-to-day rules every new component must follow.

### Fonts

Loaded via `next/font/local` in `apps/web/app/fonts.ts` and injected as CSS variables on `<html>` from `apps/web/app/layout.tsx`. Composed into three semantic stacks in `globals.css`:

- **`font-serif`** — New York (Display / Large / Medium). Headlines, balances, hero numerals.
- **`font-sans`** — Geist Sans. Default body text; set on `<body>`.
- **`font-mono`** — Departure Mono (with Geist Mono fallback). Labels, eyebrows, badges, button text, all uppercase + tracking.
- `apps/web/app/fonts/InstrumentSerif-Regular.ttf` is **only** loaded by `app/opengraph-image.tsx` for the OG image — never used in the running app.

### Color tokens

Every value resolves to a hue/neutral step; no raw hex values in components.

- **Palette:** 9-step neutrals (`--n100` … `--n900`) + 8 hues × 8 steps (Pink `p`, Red `r`, Orange `o`, Yellow `y`, Blue `b`, Teal `t`, Purple `pu`, Green `g`).
- **Surface:** `--surface-page` / `--surface-card` / `--surface-sunken` / `--surface-inverse`.
- **Foreground:** `--fg-primary` / `--fg-secondary` / `--fg-muted` / `--fg-disabled` / `--fg-inverse`.
- **Border:** `--border-default` / `--border-subtle` / `--border-strong` / `--border-focus`.
- **Accent (cobalt blue, `--b500`):** `--accent-primary` / `--accent-primary-hover` / `--accent-primary-bg`.
- **Status (each has `-fg` / `-bg` / `-border` / `-solid`):** `--success-*` / `--warning-*` / `--error-*` / `--info-*`.
- **Charts:** `--chart-1` … `--chart-4` (sequential greys) + `--color-purple` / `--color-purple-bg` for Activity icons.

### Tailwind utilities

The `@theme inline` block in `globals.css` exposes every token as a Tailwind utility. Reach for these — never raw hex or `red-400`-style defaults:

- `bg-surface-card`, `text-fg-primary`, `border-border-subtle`, `bg-accent-primary`
- `text-success-fg`, `bg-error-bg`, `border-warning-border`, `bg-info-solid`
- `bg-p400`, `text-pu500`, etc. (full hue palette, primarily for marketing illustrations)
- `rounded-pill`, `rounded-xs`, `shadow-flat`, `shadow-modal`, `shadow-focus-ring`
- `font-serif` / `font-sans` / `font-mono`

### Typography ramp

`globals.css` exposes semantic ramp classes that mirror the Typography handoff: `.ads-h1` / `.ads-h2` / `.ads-h3`, `.ads-body[-b/-sm/-sm-b/-xs/-xs-b]`, `.ads-label-md` / `.ads-label-sm`, `.ads-button-md` / `.ads-button-sm`, `.ads-code`, plus numeral helpers `.num-display` / `.num-tabular` / `.label-mono`.

### Theming (light + dark, Phase 6 onward)

- The authenticated app shell (`/new`, `/chat/[sessionId]`, `/settings`) and the utility/handoff surfaces (`/verify`, `/auth/callback`, `/pay/[slug]`) all theme via `data-theme="dark"` on `<html>`. Marketing (`/`, `/savings`, `/credit`, `/swap`, `/send`, `/receive`) and legal (`/privacy`, `/terms`, `/disclaimer`, `/security`) stay **light-locked**. Single source of truth: `apps/web/lib/theme/public-paths.ts`, consumed by both the inline anti-flash script (`lib/theme/script.ts`) and the runtime `ThemeProvider`.
- Default user pref: `system` (follows `prefers-color-scheme`). Toggle lives in Settings → Account → Appearance — there is **no** sidebar toggle (removed post-Phase 6 — too much nav-rail noise).
- All dark overrides live in the single `[data-theme="dark"] { ... }` block in `globals.css`. **Never** branch a component on theme. **Never** use `dark:` Tailwind variants. If a screen looks wrong in dark, the fix is either (a) tune a token in that block, or (b) replace a hardcoded color with the right semantic token.
- **Theme-flipping semantic tokens** — for the handful of surfaces that sit at *different* positions in the surface hierarchy between light and dark per the dark prototype (where a single canonical `surface-{page|card|sunken}` token can't express the flip):
  - `--surface-input` — composer/textarea bg (light: card; dark: deepest panel)
  - `--surface-nav` — sidebar/nav rail bg (light: sunken; dark: lifted card)
  - `--surface-nav-hover` — sidebar row hover (always one step lighter than nav)
  - `--bubble-user-bg` / `--bubble-user-fg` — user chat bubble (near-black bg + white text in *both* themes)

### Conventions

- Group utilities: layout → spacing → sizing → colors → effects.
- `cn()` for conditional classes.
- New marketing/landing components live under `components/landing/`; shared primitives (`BorderedGrid`, `BrowserFrame`, `QRReceiptCard`) sit alongside section components.

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
