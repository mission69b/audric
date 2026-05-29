# Audric — web

The Next.js app behind [**audric.ai**](https://audric.ai): an AI agent for your money on [Sui](https://sui.io). Chat with Audric to save, send, swap, borrow, and get paid — every action confirmed by a tap, gas sponsored, nothing custodial.

## The product

Audric is five surfaces, one agent:

| | Product | What you do |
|---|---|---|
| 🪪 | **Passport** | Sign in with Google → a non-custodial Sui wallet in seconds. Every money action waits on your tap-to-confirm. Gas is sponsored. |
| 🧠 | **Intelligence** | The agent. Understands your finances, reasons about each decision behind safety guards, remembers context across sessions. |
| 💰 | **Finance** | Save (NAVI lending), borrow against savings, swap (Cetus best-route), and read interactive charts — from chat. |
| 💸 | **Pay** | Send USDC to anyone, receive via payment links + QR. Free, global, instant. |
| 🛒 | **Store** | Creator marketplace at `audric.ai/username`. _(Coming soon.)_ |

## How it fits with t2000

Audric is the consumer brand. The capabilities underneath ship from the **t2000** infrastructure monorepo as versioned npm packages:

| Package | Role in this app |
|---|---|
| [`@t2000/engine`](https://npmjs.com/package/@t2000/engine) | The agent runtime — tools, reasoning, safety guards, memory. Streamed into the chat route. |
| [`@t2000/sdk`](https://npmjs.com/package/@t2000/sdk) | Sui transaction builders (NAVI save/borrow, Cetus swap, transfers) + the token registry. |
| `@t2000/ui` | Geist Design System tokens + themed shadcn primitives. This app consumes the **tokens**; the chat shell primitives stay forked from the Vercel template. |
| [`@t2000/mcp`](https://npmjs.com/package/@t2000/mcp) | Multi-step skills, exposed as MCP prompts. |

The app itself owns the surfaces a user touches: auth, persistence, the sponsored-transaction flow, and how the agent's output is rendered (chat, cards, canvases).

## Stack

- **Framework** — Next.js 16 (App Router, Turbopack), React 19.
- **AI** — AI SDK v6 (`useChat`) driving the `@t2000/engine` agent, via Vercel AI Gateway.
- **Auth** — zkLogin (Google OAuth → Sui address) through `@mysten/dapp-kit`; Enoki for gas sponsorship.
- **Chain** — `@mysten/sui` v2.x + `@mysten/payment-kit`.
- **Data** — Prisma → Neon Postgres; Upstash Redis for sessions; `@mysten-incubation/memwal` for agent memory.
- **Styling** — Tailwind v4 + Geist Design System tokens (from `@t2000/ui`). Light by default with a class + `data-theme` theme switcher (`next-themes`). Type: New York Large + Geist + Departure Mono.
- **Lint/format** — Biome (via `ultracite`).

## Local dev

```bash
pnpm install                        # from the audric repo root
pnpm --filter @audric/web-v2 dev    # http://localhost:3001
```

Environment variables are validated at boot by a Zod schema in [`lib/env.ts`](./lib/env.ts) — the server won't start if a required var is missing or empty. zkLogin needs its OAuth redirect URI registered with Google for `localhost`; most smoke testing happens against preview/prod deploys.

## Routes

| Route | Purpose |
|---|---|
| `/chat`, `/chat/[id]` | The home surface — live composer + persistent (private/public) chats. |
| `/share/[id]` | Read-only public viewer for a shared chat. |
| `/[username]` | Public Store profile (`audric.ai/funkii`). |
| `/pay/[slug]` | Public payment-link receipt. |
| `/settings/*` | Passport (identity), Safety (health factor + permissions), Memory. |
| `/auth/*` | zkLogin sign-in. |
| `/api/*` | Chat persistence, sponsored-tx (`transactions/{prepare,execute}`), and the canonical read surfaces consumed by `@t2000/engine` tools. |

## Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next dev / production build / production server (port 3001) |
| `lint` / `fix` | `ultracite check` / `ultracite fix` (Biome) |
| `check:ads` | Guards against reintroducing legacy Agentic DS tokens — Geist DS is the single source of truth |
| `typecheck` | `tsc --noEmit` |
| `test` / `test:e2e` | Vitest / Playwright |

## Attribution

Forked from [`vercel/ai-chatbot`](https://github.com/vercel/ai-chatbot) and progressively re-shelled (auth, persistence, model routing, render surface). The template's original README is preserved as [`README.template.md`](./README.template.md) for credits.

> Internal execution history, SPEC phases, and the open backlog live in the founder-local trackers (`audric-build-tracker.md`, `HANDOFF_NEXT_AGENT.md`) and `t2000/spec/`, not here.
