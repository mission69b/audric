/**
 * One non-zero user balance leg with USD overlay. Mirrors
 * `TransactionLeg` from `@t2000/sdk` plus the audric-side
 * `usdValue` that the activity route prices via `getTokenPrices`.
 *
 * `usdValue` is the CURRENT USD value of the leg (today's price ×
 * historical token amount). Historical pricing isn't worth the
 * structural complexity for a non-trading product — see the
 * 2026-05-10 activity rebuild design notes.
 */
export interface ActivityLeg {
  coinType: string;
  asset: string;
  decimals: number;
  /** Token quantity, always positive. */
  amount: number;
  /** `'out'` if user spent, `'in'` if user received. */
  direction: 'in' | 'out';
  /**
   * Current USD value of this leg, or `null` when the price was
   * unavailable (long-tail tokens not in BlockVision's coverage,
   * or all-degraded BlockVision sessions).
   */
  usdValue: number | null;
  /** True when the asset is a USD-pegged stablecoin (price ≈ token amount). */
  isStable: boolean;
}

export interface ActivityItem {
  id: string;
  source: 'chain' | 'app';
  /**
   * Display kind discriminator. `'bundle'` is set when a single PTB
   * has multiple distinct write operations (swap+save, swap+swap+save,
   * etc.); UI renders it collapsibly with per-leg breakdown.
   *
   * Other values mirror `ChainTxRecord.action` plus app-event types
   * (`'pay'`, `'pay_received'`).
   */
  type: string;
  title: string;
  subtitle?: string;
  /**
   * All non-zero user balance legs for this transaction. Always
   * present for chain-derived items (`source === 'chain'`); always
   * absent for app events (use `amount` + `asset` instead — those
   * are USD-stable values like service payments). Length 1 for
   * single-write txs, 2 for swaps, >2 for bundles.
   *
   * @since Activity rebuild / 2026-05-10
   */
  legs?: ActivityLeg[];
  /**
   * Token quantity, kept for back-compat with components that
   * pre-date `legs[]` and for app events (where there is no on-chain
   * leg structure). Equals `legs[primary].amount` when both are
   * present.
   */
  amount?: number;
  asset?: string;
  direction?: 'in' | 'out' | 'self';
  counterparty?: string;
  digest?: string;
  timestamp: number;
  paymentMethod?: string;
  /**
   * For bundles, the count of distinct write operations detected
   * via Move-call action classification. UI uses this to render
   * `Bundle (3 ops)` instead of guessing from `legs.length`.
   */
  bundleOpCount?: number;
}

// [Filter chips removal / 2026-05-10] `ActivityFilter` /
// `ACTIVITY_FILTERS` were removed alongside the chip row in
// `<ActivityFeed>`. Audric is chat-first — the agent IS the filter
// ("show me my swaps this week" surfaces a richer answer than any
// chip would). The route no longer accepts `?type=` and the cache
// no longer keys on filter.

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
  network: string;
}
