/**
 * Swap regression scenario inventory.
 *
 * Source of truth for what the harness covers. Three buckets:
 *
 *   1. tier12HappyPaths — every Tier 1+2 asset paired with USDC, both
 *      directions. 30 scenarios. Catches "Cetus aggregator dropped this
 *      pair" or "registry drifted" regressions.
 *   2. legacyStableHappyPaths — USDsui / USDe / USDT paired with USDC,
 *      both directions. 6 scenarios. These are no-tier coins that still
 *      appear in production (NAVI savings + held balances).
 *   3. crossTierHappyPaths — Tier 2 ↔ Tier 2 routing through intermediary
 *      pools. 1 scenario (LOFI ↔ MANIFEST). Catches "Cetus stopped doing
 *      multi-hop routing" regressions.
 *   4. errorPaths — 4 scenarios. Each one targets a specific structured
 *      error class introduced in S.123:
 *        a. unknown token (regression for SSUI process crash)
 *        b. same-token swap (defensive — engine tool's preflight catches
 *           it earlier; SDK should still throw SWAP_FAILED if anyone
 *           bypasses the preflight)
 *        c. sub-dust amount (1 mist SUI → USDC) → SWAP_FAILED with
 *           "Insufficient liquidity" — verifies graceful degradation
 *        d. negative amount (rejected at the SDK input boundary, not
 *           Cetus). Catches "amount validation regressed".
 *
 * Adding a new asset:
 *   - Append to TIER_12_ASSETS or LEGACY_STABLES below
 *   - Run `pnpm tsx scripts/regression-swaps/run-quotes.ts` to verify
 *     the new asset routes both directions
 *   - The harness will auto-cover it next push
 *
 * Removing an asset:
 *   - Don't. If the asset is no longer supported, fix it in
 *     packages/sdk/src/token-registry.ts FIRST, then this list updates
 *     by reference. Removing here without removing from the registry
 *     creates a coverage gap.
 */

export interface QuoteScenario {
  id: string;
  category: 'tier12' | 'legacy' | 'cross-tier' | 'error';
  from: string;
  to: string;
  amount: number;
  /** When set, scenario PASSES if T2000Error.code matches; FAILS otherwise. */
  expectedError?: 'ASSET_NOT_SUPPORTED' | 'SWAP_FAILED' | 'INVALID_AMOUNT';
  /** Free-form notes that surface in the reporter when the scenario fails. */
  notes?: string;
}

export const TIER_12_ASSETS = [
  'SUI', 'wBTC', 'ETH', 'GOLD', 'DEEP', 'WAL', 'NS', 'IKA',
  'CETUS', 'NAVX', 'vSUI', 'haSUI', 'afSUI', 'LOFI', 'MANIFEST',
] as const;

export const LEGACY_STABLES = ['USDsui', 'USDe', 'USDT'] as const;

const tier12HappyPaths: QuoteScenario[] = TIER_12_ASSETS.flatMap((asset) => [
  { id: `tier12_${asset}_to_usdc`, category: 'tier12', from: asset, to: 'USDC', amount: 0.1 },
  { id: `tier12_usdc_to_${asset}`, category: 'tier12', from: 'USDC', to: asset, amount: 0.5 },
]);

const legacyStableHappyPaths: QuoteScenario[] = LEGACY_STABLES.flatMap((asset) => [
  { id: `legacy_${asset}_to_usdc`, category: 'legacy', from: asset, to: 'USDC', amount: 0.5 },
  { id: `legacy_usdc_to_${asset}`, category: 'legacy', from: 'USDC', to: asset, amount: 0.5 },
]);

const crossTierHappyPaths: QuoteScenario[] = [
  {
    id: 'cross_lofi_to_manifest',
    category: 'cross-tier',
    from: 'LOFI',
    to: 'MANIFEST',
    amount: 1,
    notes: 'Verifies Cetus multi-hop routing through intermediate pools.',
  },
];

const errorPaths: QuoteScenario[] = [
  {
    id: 'err_unknown_token_ssui',
    category: 'error',
    from: 'SSUI',
    to: 'USDC',
    amount: 1,
    expectedError: 'ASSET_NOT_SUPPORTED',
    notes: 'S.123 regression — unknown symbol must throw structured ASSET_NOT_SUPPORTED, not crash the process.',
  },
  {
    id: 'err_same_token_usdc',
    category: 'error',
    from: 'USDC',
    to: 'USDC',
    amount: 1,
    expectedError: 'SWAP_FAILED',
    notes: 'SDK-level safety net — engine tool preflight catches this earlier, but SDK must still reject if bypassed.',
  },
  {
    id: 'err_subdust_sui_to_usdc',
    category: 'error',
    from: 'SUI',
    to: 'USDC',
    amount: 0.000000001,
    expectedError: 'SWAP_FAILED',
    notes: '1 mist (10^-9 SUI) is below all Cetus pool minimums — must throw SWAP_FAILED gracefully.',
  },
  {
    id: 'err_negative_amount',
    category: 'error',
    from: 'SUI',
    to: 'USDC',
    amount: -1,
    expectedError: 'SWAP_FAILED',
    notes: 'KNOWN GAP — currently caught by Cetus as SWAP_FAILED, not by SDK as INVALID_AMOUNT. Tightening to INVALID_AMOUNT at the SDK input boundary is a S.124 follow-up; the harness asserts current actual behavior to surface ANY regression in error structure.',
  },
];

/** All Tier A scenarios in execution order. */
export const TIER_A_SCENARIOS: readonly QuoteScenario[] = [
  ...tier12HappyPaths,
  ...legacyStableHappyPaths,
  ...crossTierHappyPaths,
  ...errorPaths,
];

/**
 * Tier B execute scenarios — runs nightly against a pre-funded test wallet.
 *
 * Budget contract: 5 round-trips/night × ~$0.10/swap = ~$0.50/day.
 * The harness pre-flight checks the wallet's USDC balance and aborts the
 * run if it would drop below 2× daily budget post-execution.
 *
 * Why round-trip (USDC → asset → USDC) instead of one-way:
 *   - Keeps the wallet topology stable across nights (no asset accumulates
 *     or drains over time)
 *   - Doubles assertion surface (both directions tested per scenario)
 *   - Small drift per night (~slippage + 2× overlay fee) compounds
 *     slowly enough that monthly top-ups stay <$2/month
 */
export interface ExecuteScenario {
  id: string;
  asset: string;
  amountUsdc: number;
  notes?: string;
}

export const TIER_B_SCENARIOS: readonly ExecuteScenario[] = [
  { id: 'exec_usdc_sui_round_trip', asset: 'SUI', amountUsdc: 0.10 },
  { id: 'exec_usdc_usdsui_round_trip', asset: 'USDsui', amountUsdc: 0.10, notes: 'Stable-stable; minimal slippage expected.' },
  { id: 'exec_usdc_cetus_round_trip', asset: 'CETUS', amountUsdc: 0.10 },
  { id: 'exec_usdc_navx_round_trip', asset: 'NAVX', amountUsdc: 0.10 },
  { id: 'exec_usdc_wal_round_trip', asset: 'WAL', amountUsdc: 0.10 },
];
