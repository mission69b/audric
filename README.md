# Audric

**Your money, handled.**

Conversational finance on [Sui](https://sui.io). Save, pay, send, borrow — all by talking to your AI financial agent. Built on [t2000](https://t2000.ai) infrastructure.

**Live at [audric.ai](https://audric.ai)**

---

## What it does

| Product | Description |
|---------|-------------|
| **Savings** | Earn yield on USDC via NAVI Protocol |
| **Pay** | Access 88+ API endpoints with USDC micropayments |
| **Send** | Transfer USDC instantly to any Sui address |
| **Credit** | Borrow USDC against your savings |
| **Receive** | Accept payments anywhere *(planned)* |

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
| AI | `@t2000/engine` → Anthropic Claude with financial tools |
| Database | NeonDB (Prisma) — users, preferences, contacts |
| Sessions | Upstash Redis (KV) |
| Styling | Tailwind CSS v4, Agentic Design System |
| Hosting | Vercel |

## Architecture

```
audric.ai (this repo)
├── @t2000/engine    ← Agent engine (QueryEngine, tools, MCP, streaming)
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

See [BRAND.md](https://github.com/mission69b/t2000/blob/main/BRAND.md) in the t2000 repo for full brand guidelines.

## License

MIT
