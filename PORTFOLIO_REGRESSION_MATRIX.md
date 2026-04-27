# Single-Source-of-Truth — Post-Merge Regression Matrix

After deploying the canonical-portfolio refactor (April 2026), walk this matrix once against production. Every row should produce the **same numbers** across every column for the same wallet — that's the whole point of the refactor.

## Test wallets

Pick at least one wallet from each row to cover all the ways the canonical fetcher has to behave:

| ID | Type | Why it matters | Address (fill in pre-merge) |
|----|------|----------------|------------------------------|
| W1 | Audric user, has USDC + savings + no debt | Most common case; baseline | `0x...` |
| W2 | Audric user, has SUI + USDC + USDsui in NAVI + active debt | Multi-asset stable, exercises healthFactor | `0x...` |
| W3 | Watched address, no Audric account | Engine `balance_check` for a non-user; `WatchAddressCanvas` path | `0x...` |
| W4 | Empty wallet (zero balances, no positions) | Degraded path; should render `$0` everywhere, no errors | `0x...` |
| W5 | Wallet with only tradeables (BTC / ETH / GOLD), no stables | Confirms `walletValueUsd` includes priced non-stable coins | `0x...` |
| W6 | Brand-new wallet (no PortfolioSnapshot history) | `PortfolioTimelineCanvas` "current snapshot only" fallback | `0x...` |

## Surfaces × wallets

For each test wallet, verify these surfaces all show identical `walletValueUsd`, `savings`, `debt`, and `netWorth`:

| Surface | Path | Notes |
|---|---|---|
| Dashboard balance hero | `/new` (logged in) | `useBalance` hook → `/api/portfolio` |
| Full portfolio canvas | Chat: "show my full portfolio" | `FullPortfolioCanvas` reads engine-seeded portfolio |
| Watch-address canvas | Chat: "what does <address> have?" | `WatchAddressCanvas` → `/api/portfolio` |
| Portfolio timeline canvas | Chat: "show my portfolio for the last 90 days" | `PortfolioTimelineCanvas` → `/api/analytics/portfolio-history` |
| Engine `balance_check` | Chat: "what are my assets?" | Routes through `fetchAudricPortfolio` → `/api/portfolio` |
| Engine `portfolio_analysis` | Chat: "analyze my portfolio" | Same audric-API path as above |
| Engine `transaction_history` | Chat: "show my recent transactions" | Routes through `fetchAudricHistory` → `/api/history` |
| `/api/portfolio` (raw) | curl `?address=...` | Canonical reference number |
| `/api/positions` (raw) | curl `?address=...` | Should match portfolio.positions slice |
| `/api/rates` | curl | Sanity check best USDC save rate |
| Daily portfolio-snapshot cron | DB row in `PortfolioSnapshot` | `walletValueUsd` should be priced sum |
| Daily financial-context-snapshot cron | DB row in `UserFinancialContext` | `walletUsdc` + `walletUsdsui` granular |

## Pass criteria

For each (wallet, surface) cell:

- ✅ Same `walletValueUsd` to ±$0.01
- ✅ Same `savings` to ±$0.01
- ✅ Same `borrows` to ±$0.01
- ✅ Same `netWorthUsd` to ±$0.01
- ✅ Identical health-factor display ("Safe" / a number / "—")
- ✅ Same per-coin allocation list (USDC, USDsui, SUI, tradeables)
- ✅ No `$0 in savings when wallet has $X in NAVI` regressions
- ✅ Engine never hallucinates a price (no "$3.50/SUI"-class errors)
- ✅ Empty wallets render `$0` cleanly, never `NaN` or `undefined`

## Pre-merge automated check

Run the shadow validator against staging for at least W1, W2, W4:

```bash
node apps/web/scripts/portfolio-shadow-check.mjs \
  --base https://staging.audric.ai \
  --address 0x...
```

Exit code `0` = no divergence. Anything else, **do not merge**.

## Post-merge probe (production)

Within 30 minutes of deploying to prod:

1. Open dashboard for one of YOUR own wallets in incognito.
2. Compare the `Net Worth` hero against `/api/portfolio?address=YOUR_ADDR`.
3. Run the chat agent: "what are my assets?" — confirm the LLM-rendered total matches.
4. Trigger the canvases ("show my full portfolio", "show my portfolio for the last 90 days") — confirm same total.
5. Watch a non-Audric address ("what does 0x... have?") — confirm same total in `WatchAddressCanvas`.

If any number disagrees by more than $0.01, page on-call. The whole architecture is built so this can't happen — divergence means a regression slipped past lint + spec-consistency + the contract test, which would be a bug in the gates themselves.

## Cleanup tasks (week after merge)

- Delete `apps/web/lib/portfolio-data.ts` once `fetchPositions` is inlined into `lib/portfolio.ts`. Right now it stays as an internal helper because moving it would balloon this PR.
- Audit any new PR that adds an `/api/*` route that reads wallet/position data — every one must be a thin adapter over a canonical fetcher (the ESLint rule will block obvious violations, but reviewer eyes still matter for novel patterns).
- Remove this matrix doc once the refactor's been stable in prod for 30 days.
