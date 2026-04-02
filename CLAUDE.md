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
├── apps/web/           ← audric.ai (Next.js, Vercel)
│   ├── app/            ← App Router pages + API routes
│   ├── components/     ← UI components (auth, dashboard, engine, settings, ui)
│   ├── hooks/          ← React hooks (useEngine, useBalance, useChipFlow, etc.)
│   ├── lib/            ← Utilities, types, engine factory, constants
│   ├── prisma/         ← Database schema (users, preferences, contacts)
│   └── types/          ← TypeScript type definitions
├── patches/            ← pnpm patches (@naviprotocol/lending)
└── pnpm-workspace.yaml
```

### Product catalog (5 products)

| Product | Integration | Status |
|---------|-------------|--------|
| **Savings** | NAVI MCP + thin tx builders | Live |
| **Pay** | MPP / t2000 gateway | Live |
| **Send** | Direct Sui transactions | Live |
| **Credit** | NAVI MCP + thin tx builders | Live |
| **Receive** | Direct Sui transactions | Planned |

---

## Critical Rules

1. **USDC only.** All user-facing amounts are USDC. No multi-asset complexity.
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
  → QueryEngine → AnthropicProvider → Claude with tools
  → Read tools (balance, savings, health) → auto-executed server-side
  → Write tools (save, withdraw, send) → pending_action event
  → Client displays confirmation card
  → Client executes transaction on-chain (zkLogin + Enoki gas)
  → POST /api/engine/resume with execution result
  → Engine continues conversation with result
```

### Engine imports

```ts
import { QueryEngine, AnthropicProvider, getDefaultTools } from '@t2000/engine';
import { serializeSSE, parseSSE, engineToSSE } from '@t2000/engine';
import { McpClientManager, NAVI_MCP_CONFIG } from '@t2000/engine';
import type { PendingAction, EngineEvent, SSEEvent } from '@t2000/engine';
```

### Engine event types

```ts
type EngineEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'pending_action'; action: PendingAction }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: Error };
```

---

## Auth: zkLogin + Enoki

- Google OAuth → JWT → ephemeral Ed25519 keypair → ZK proof → deterministic Sui address
- No private key, no seed phrase — wallet derived from Google JWT
- Ephemeral keys are session-scoped, never persisted to server
- All transactions gas-free via Enoki sponsorship

---

## Tooling

- **Package manager:** pnpm (v10.6.2)
- **Build:** Turbo
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS v4 + shadcn/ui patterns
- **State:** TanStack Query + custom hooks
- **Database:** NeonDB (Prisma) — users, preferences, contacts
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
| `DATABASE_URL` | NeonDB Postgres connection string |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `KV_REST_API_URL` | Upstash Redis URL |
| `KV_REST_API_TOKEN` | Upstash Redis token |
| `NEXT_PUBLIC_MPP_GATEWAY_URL` | MPP gateway URL (`https://mpp.t2000.ai`) |

---

## Links

| Resource | URL |
|----------|-----|
| Audric (consumer) | `audric.ai` |
| t2000 (infra) | `t2000.ai` |
| suimpp (protocol) | `suimpp.dev` |
| MPP Gateway | `mpp.t2000.ai` |
| Engine npm | `npmjs.com/package/@t2000/engine` |
