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
│   ├── app/                    ← App Router pages + API routes (71 routes, 20 internal)
│   ├── components/             ← UI components (auth, dashboard, engine, settings, ui)
│   │   └── engine/cards/       ← 21 rich card components + 8 canvas components
│   ├── hooks/                  ← React hooks (useEngine, useBalance, useChipFlow, etc.)
│   ├── lib/                    ← Utilities, types, constants
│   │   ├── engine/             ← engine-factory.ts, engine-context.ts (F1-F5 assembly)
│   │   ├── portfolio-data.ts   ← Unified portfolio data (wallet + positions + snapshots)
│   │   └── activity-data.ts    ← Unified activity data (app events + chain txs)
│   ├── prisma/                 ← 15+ models (profiles, memories, schedules, analytics, ...)
│   └── types/                  ← TypeScript type definitions
├── patches/                    ← pnpm patches (@naviprotocol/lending)
└── pnpm-workspace.yaml
```

### Product catalog (5 products)

| Product | Integration | Status |
|---------|-------------|--------|
| **Savings** | NAVI MCP + thin tx builders | Live |
| **Pay** | MPP / t2000 gateway | Live |
| **Send** | Direct Sui transactions | Live |
| **Credit** | NAVI MCP + thin tx builders | Live |
| **Receive** | Payment links, invoices, QR | Live |

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
  → POST /api/engine/chat (SSE stream)
  → engine-context.ts: buildFullDynamicContext() → injects profile, memory, proactiveness
  → engine-factory.ts: QueryEngine → AnthropicProvider → Claude with 47 tools
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

### Scheduled actions flow

```
User: "Save $2 USDC to NAVI every week"
  → create_schedule tool (isReadOnly: false → pending_action)
  → Client confirms → POST /api/scheduled-actions (creates ScheduledAction row)
  → t2000 server cron → POST /api/internal/execute-schedule (x-internal-key auth)
  → Server-side execution with trust ladder (5 successful runs → auto-confirm)
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

## Intelligence Layer (F1–F5)

Assembled in `lib/engine/engine-context.ts` via `buildFullDynamicContext()` and injected into the engine system prompt each turn.

| Feature | What it does |
|---------|-------------|
| **F1 — Financial Profile** | `UserFinancialProfile` Prisma model: risk tolerance, goals, income bracket, investment horizon |
| **F2 — Proactive Awareness** | Morning briefings, anomaly detection, follow-up queues |
| **F3 — Episodic Memory** | `UserMemory` Prisma model: key facts, preferences, past decisions remembered across sessions |
| **F4 — Conversation State** | `ConversationLog` tracks topic, intent, and flow state per session |
| **F5 — Self-Evaluation** | `AdviceLog` + `OutcomeCheck`: records advice given, checks outcomes later, adjusts confidence |

---

## Rich Cards + Canvas

### Rich cards (21 components)

Located in `components/engine/cards/`. Rendered client-side based on `toolName` in `tool_result` events. Registered in `cards/index.ts` via `CARD_RENDERERS` map.

Examples: `SavingsCard`, `BalanceCard`, `StakingCard`, `ProtocolCard`, `PriceCard`, `HealthCard`, `TransactionCard`, `ScheduleCard`, `AllowanceCard`, `SpendingCard`, `YieldCard`

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
