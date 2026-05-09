# Swap Regression Harness — S.124

Automated regression coverage for every swap path Audric supports. Catches the
next SSUI-class incident (process crash from an unhandled rejection in the swap
flow) before users see it.

## Why this exists

In April 2026, a user typed `swap 1 SSUI to USDC`. The token wasn't recognized
by the SDK token registry, so `getSwapQuote()` threw a generic `Error`. The
engine's `EarlyToolDispatcher` had no `.catch()` on the dispatched promise, the
unhandled rejection propagated to Node's default handler, and the process
exited with code 128 — taking down every concurrent user's session.

S.123 fixed the runtime (process-survival handlers + structured `T2000Error`
instances + LLM recovery hints). This harness is the **regression net** that
catches the NEXT class-of-bug before it ships:

- A Cetus aggregator removes a pair we depend on
- The token registry decimals drift away from on-chain values
- A new SDK code path throws an unhandled rejection
- The S.123 structured-error contract gets accidentally reverted to generic Error

## Two tiers + manual

| Tier | What it covers | Frequency | Cost | Status |
|---|---|---|---|---|
| **A — Quote** | 41 scenarios via `getSwapQuote()`. No on-chain mutation. | Every push + PR + nightly cron 03:00 UTC | $0 | LIVE |
| **B — Execute (SDK direct)** | 5 round-trip swaps via `agent.swap()` against a pre-funded test wallet | Nightly cron 04:00 UTC + manual dispatch | ~$0.012/round-trip × 5/night ≈ $0.06/night ≈ $1.80/mo | LIVE (gated on `REGRESSION_TEST_WALLET_PRIVKEY` secret) |
| **Manual — Enoki sponsorship** | One swap (e.g. `swap 0.10 USDC for SUI`) on production audric.ai chat | When Tier B alerts (Discord) | $0.0001 | Founder workflow — not automated |

Tier B uses `T2000.fromPrivateKey(privkey)` and signs directly with the test
wallet's keypair — it does NOT go through Enoki sponsorship. That's intentional:
it tests the SDK swap path that Audric depends on without inventing a
zkLogin/Google OAuth automation. The Enoki path is exercised every time a real
user signs in; when Tier B alerts, the natural follow-up is one manual swap on
prod to confirm the sponsored flow still works.

Tier C (`harvest_rewards` compound bundle) is a documented gap — the tool
needs an actual NAVI position with claimable rewards, which can't be
deterministically simulated. Revisit once the Tier B test wallet has a stable
reward stream.

## Tier A coverage matrix (41 scenarios)

| Category | Count | Scenarios |
|---|---|---|
| `tier12` | 30 | Every Tier 1+2 asset paired with USDC, both directions: SUI, wBTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, haSUI, afSUI, LOFI, MANIFEST |
| `legacy` | 6 | Legacy stables: USDsui, USDe, USDT — both directions vs USDC |
| `cross-tier` | 1 | LOFI ↔ MANIFEST (verifies Cetus multi-hop routing through intermediaries) |
| `error` | 4 | Unknown token (SSUI), same-token, sub-dust amount, negative amount |

**Adding a new asset:** append to `TIER_12_ASSETS` or `LEGACY_STABLES` in
`scenarios.ts`, run the harness once, done. The 2 directions × USDC pairing
auto-generates.

**Removing an asset:** don't. Fix it in
`packages/sdk/src/token-registry.ts` first; this list updates by reference.

## Usage

### Tier A — quote regression

```bash
# Runs locally in ~2.5s. No env required.
pnpm --filter web exec tsx scripts/regression-swaps/run-quotes.ts

# With custom concurrency (default 4; drop to 2 if Cetus rate-limits)
CONCURRENCY=2 pnpm --filter web exec tsx scripts/regression-swaps/run-quotes.ts
```

### Tier B — execute regression

```bash
# Requires a funded test wallet. Generate once:
pnpm --filter web exec tsx scripts/regression-swaps/gen-test-wallet.ts
# → prints address + privkey + funding instructions. Save the privkey somewhere.

# Pre-flight check only (verify wallet has balance, no swaps executed):
REGRESSION_TEST_WALLET_PRIVKEY=suiprivkey... \
  pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts --dry-run

# Real run (5 round trips, ~$0.06 spent on slippage+fees+gas):
REGRESSION_TEST_WALLET_PRIVKEY=suiprivkey... \
  pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts

# Drain wallet (sweep all USDC + SUI to a recovery address):
REGRESSION_TEST_WALLET_PRIVKEY=suiprivkey... \
DRAIN_TO_ADDRESS=0x... \
  pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts --drain
```

### Tier B exit codes

| Exit | Meaning | CI action |
|---|---|---|
| `0` | All 5 round trips passed | Discord PASS message |
| `1` | At least one round trip regressed | Discord FAIL alert (red); founder runs manual Enoki smoke test |
| `3` | Pre-flight failed (no privkey, drained wallet, or RPC unreachable) | Discord PRE-FLIGHT alert (orange); founder refills wallet |
| `4` | Drain succeeded (special — not a failure) | No alert |

### Test wallet setup (one-time)

1. Run `gen-test-wallet.ts` — prints a fresh Sui address + Bech32 private key
2. Send `$5 USDC` + `$2 SUI` to the address (covers ~3 months of nightly runs)
3. Add the privkey as a GitHub Actions secret named `REGRESSION_TEST_WALLET_PRIVKEY`
4. Verify with `--dry-run` locally (pre-flight should pass)
5. First real run with `pnpm tsx run-executes.ts` (~$0.06 spent)
6. Done. Nightly cron at 04:00 UTC takes over.

Output:

- Console summary with per-category pass/fail + p50/p95/max latency
- JSON artifact under `runs/` (gitignored locally; uploaded as a workflow
  artifact in CI with 30-day retention)
- Process exit code:
  - `0` — all 41 scenarios passed
  - `1` — at least one happy-path regressed (BLOCK MERGE — user-visible)
  - `2` — at least one error-path regressed (BLOCK MERGE — defensive structure)
  - `3` — fatal harness internal error

## Tier A CI integration

Workflow: `.github/workflows/regression-swaps.yml`

Triggers:

- `push` to `main` — but only on paths that could plausibly affect swap
  routing (the harness itself, the prepare/route, the swap libs, package
  bumps, lockfile, the workflow itself)
- `pull_request` against `main` — same path filter
- `workflow_dispatch` — manual run with optional concurrency override
- `schedule: '0 3 * * *'` — daily at 03:00 UTC (catches Cetus aggregator
  drift even when no commits land)

On failure:

- Workflow exits non-zero → blocks merge for PRs
- Posts a summary comment on the PR with the harness output
- Pings Discord (`secrets.DISCORD_DEVLOG_WEBHOOK`) on push/cron failures
  with severity color: red for happy-path, orange for error-path, purple for
  harness internal

## Failure modes the harness catches

| Failure | Symptom in CI | Action |
|---|---|---|
| Cetus dropped a pair | One `tier12_*_to_usdc` or `tier12_usdc_to_*` fails | Open Cetus issue; remove asset from registry if confirmed dropped |
| Token registry decimals drifted | `tier12` scenario passes but `toAmount` is off by 10^N | Fix `packages/sdk/src/token-registry.ts` decimals field |
| Multi-hop routing broke | `cross_lofi_to_manifest` fails | Open Cetus issue; document gap in scenario notes |
| S.123 structured error regressed to generic Error | `err_unknown_token_ssui` fails (no `errorCode` set) | Re-apply S.123 fix to the affected SDK throw site |
| Harness can't reach Cetus at all | Every scenario fails with timeout | Check Cetus mainnet status; rerun |

## Known gaps (documented, not yet covered)

1. **`harvest_rewards` compound bundle** — needs claimable NAVI rewards;
   defer until Tier B test wallet has a stable reward stream.
2. **`borrow` / `repay` / `save_deposit` writes** — covered by audric's
   own integration tests on the prepare/execute routes; this harness focuses
   on swaps which were the source of the S.123 incident.
3. **SDK input validation for negative/zero amounts** — currently caught
   downstream by Cetus as `SWAP_FAILED`. The harness asserts current actual
   behavior; tightening to `INVALID_AMOUNT` at the SDK input boundary is
   tracked as a S.124 follow-up.
4. **Slippage guard regression** — preflight guard tests live in
   `packages/engine/src/__tests__/swap-telemetry.test.ts`. Not duplicated
   here.

## File layout

```
scripts/regression-swaps/
├── README.md             ← you are here
├── scenarios.ts          ← 41 Tier A + 5 Tier B scenarios (data only)
├── scenarios.test.ts     ← inventory shape validators (10 tests)
├── reporter.ts           ← summary + JSON artifact + exit code classifier
├── reporter.test.ts      ← classifier semantics (9 tests)
├── run-quotes.ts         ← Tier A entry point (every push + nightly cron 03:00)
├── run-executes.ts       ← Tier B entry point (nightly cron 04:00 + dispatch)
├── gen-test-wallet.ts    ← one-shot wallet generator + funding instructions
└── runs/                 ← gitignored output JSONs (30d retention in CI)
```

## Cross-references

- S.123 — runtime fix that introduced structured errors (this harness verifies
  S.123 doesn't get accidentally reverted)
- `packages/sdk/src/swap-quote.ts` — the function under test
- `packages/sdk/src/protocols/cetus-swap.ts` — the underlying aggregator
- `packages/engine/src/tools/swap-quote.ts` — engine tool wrapping the SDK
- `audric-build-tracker.md` S.124 entry — full implementation log
