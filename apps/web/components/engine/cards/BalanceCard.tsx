'use client';

import { AddressBadge, CardShell, fmtUsd } from './primitives';

interface BalanceData {
  available?: number;
  savings?: number;
  debt?: number;
  total?: number;
  /** [engine v0.50.2] Aggregated DeFi positions outside savings — 9 protocols (excludes NAVI, which is in `savings`). */
  defi?: number;
  /** [engine v0.50.2] Per-protocol breakdown — keys are lowercase protocol slugs. */
  defiByProtocol?: Record<string, number>;
  /**
   * [engine v0.50.3] DeFi fetch state:
   *   - 'blockvision'    → all 9 protocols responded successfully
   *   - 'partial'        → at least one protocol failed; total may under-count
   *   - 'partial-stale'  → [v0.54] fresh fetch failed; serving last-known-good
   *                        positive value from the sticky cache (≤30min old).
   *                        Card renders "DeFi $X · cached Nm ago" with the
   *                        provenance visible so the user knows it's a
   *                        sticky fallback, not a fresh read.
   *   - 'degraded'       → no API key OR every protocol failed; total UNKNOWN, not zero
   *
   * The card surfaces a "DeFi —" placeholder for non-`blockvision` sources
   * when total is 0. The `partial-stale` source always has total > 0 (the
   * fetcher only returns it when there's a positive cached value to fall
   * back on), so it renders the value with a "cached Nm ago" suffix
   * instead of the placeholder.
   */
  defiSource?: 'blockvision' | 'partial' | 'partial-stale' | 'degraded';
  /**
   * Wall-clock ms when the underlying DeFi data was priced. Used to
   * render "cached Nm ago" for the `partial-stale` source. Optional
   * for backward compatibility — older engines don't ship this.
   */
  defiPricedAt?: number;
  holdings?: { symbol: string; balance: number; usdValue: number }[];
  /** [v0.49] Stamped by the engine's balance_check tool. */
  address?: string;
  /** [v0.49] False for watched-address reads. */
  isSelfQuery?: boolean;
  /**
   * [v1.2 SuiNS] Original SuiNS name when the user passed
   * `address: "alex.sui"`. Used by the watched-address chip so the user
   * sees "alex.sui" instead of "0x4abc…1234".
   */
  suinsName?: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-W1 — post-write variant (2026-05-11)
//
// `default`    → 3-5 cols + holdings footer (the always-on standalone card the
//                user gets when they ask "what's my balance"). Unchanged.
//
// `post-write` → 2-3 cols, no holdings footer, tighter padding. Rendered by
//                <PostWriteRefreshSurface> below a save/withdraw/swap+save
//                receipt to communicate "here's what changed" without
//                duplicating the full standalone card 80px below the
//                receipt.
//
// Why drop "Total" + holdings in post-write? After a write, the user already
// knows what just happened (the receipt above shows the action, the bundle
// row shows the route). What they want next is "where's my money now" —
// Wallet vs Savings vs DeFi. The total is a derived sum the eye computes;
// the holdings list is high-density context for "what do I own", not "what
// did this write change". Dropping both buys back ~50px of vertical space
// without losing the post-write signal.
//
// Demo bar: `audric_demos_v2/demos/01-save-50.html` step 5 — 3-col grid
// (`AVAILABLE · USDC` / `EARNING · USDsui` / `HELD · SUI`) inline below the
// receipt. We use the canonical engine columns rather than per-write custom
// labels so this works for save / withdraw / swap+save without bespoke
// per-tool wiring (W1 stays narrow; per-tool labels are deferred to a
// future spec item if/when the founder asks for it).
// ───────────────────────────────────────────────────────────────────────────

interface BalanceCardProps {
  data: BalanceData;
  variant?: 'default' | 'post-write';
}

export function BalanceCard({ data, variant = 'default' }: BalanceCardProps) {
  const isPostWrite = variant === 'post-write';

  const cols: { label: string; value: string; color?: string }[] = [];
  // Total: skip in post-write (the receipt above already shows the delta;
  // the user can sum the columns themselves if they want the total).
  if (!isPostWrite && data.total != null) cols.push({ label: 'Total', value: `$${fmtUsd(data.total)}` });
  // [v0.55 Fix 2] "Wallet" instead of "Cash" — the value here aggregates every
  // priced wallet asset (USDC + SUI + tradeables), not just stables, so "Cash"
  // mismatched the user's mental model (e.g. SUI showing under "Cash" surprised
  // testers who expected only USDC/USDsui). The internal property name stays
  // `available` / `cash` to avoid a wider rename — labels are user-facing only.
  if (data.available != null) cols.push({ label: 'Wallet', value: `$${fmtUsd(data.available)}` });
  if ((data.savings ?? 0) > 0) cols.push({ label: 'Savings', value: `$${fmtUsd(data.savings!)}`, color: 'text-success-solid' });
  if ((data.defi ?? 0) > 0) {
    // [v0.54] partial-stale: render the cached value with provenance so
    // the user can tell the difference between fresh and sticky data.
    // The number is real ($X actually exists in DeFi), but BlockVision
    // failed on this turn, so we're showing what we knew Nm ago.
    if (data.defiSource === 'partial-stale' && data.defiPricedAt) {
      const ageMin = Math.max(0, Math.round((Date.now() - data.defiPricedAt) / 60_000));
      cols.push({
        label: 'DeFi',
        value: `$${fmtUsd(data.defi!)} · ${ageMin}m`,
        color: 'text-warning-solid',
      });
    } else {
      cols.push({ label: 'DeFi', value: `$${fmtUsd(data.defi!)}`, color: 'text-success-solid' });
    }
  } else if (!isPostWrite && data.defiSource && data.defiSource !== 'blockvision') {
    // [v0.53.4] Surface unavailability rather than silently hiding the
    // column for ANY non-blockvision source with $0 total. `partial`
    // and `degraded` are both "we don't know" states — see the
    // `defiSource` JSDoc on `BalanceData` above for the bug rationale.
    // Skip this in post-write: a "—" column adds noise without changing
    // anything the write touched. The standalone card surfaces it.
    cols.push({ label: 'DeFi', value: '—', color: 'text-fg-muted' });
  }
  if ((data.debt ?? 0) > 0) cols.push({ label: 'Debt', value: `$${fmtUsd(data.debt!)}`, color: 'text-warning-solid' });

  const hasHoldings = !isPostWrite && data.holdings && data.holdings.filter((h) => h.usdValue >= 0.01).length > 0;
  const isWatched = data.isSelfQuery === false && !!data.address;
  // NOTE: `badge` is intentionally dropped in post-write — see CardShell's
  // `noHeader` JSDoc. Post-write clusters only fire on the signed-in user's
  // own wallet (writes can't sign on watched addresses), so `isWatched` is
  // always false here in production. If that invariant ever changes, the
  // badge will silently disappear — switch to a floating-badge layout in
  // CardShell at that point.
  const badge = isWatched ? <AddressBadge address={data.address!} suinsName={data.suinsName} /> : undefined;
  // Post-write: skip the "Balance" title bar entirely — the surface header
  // above the cluster already communicates "AFTER YOUR APPROVAL · REFRESHING
  // STATE", so a duplicate "Balance" title 4px below it is noise.
  const cellPad = isPostWrite ? 'px-2.5 py-1.5' : 'px-3 py-2';

  return (
    <CardShell title="Balance" badge={badge} noPadding noHeader={isPostWrite}>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
      >
        {cols.map((col, i) => (
          <div
            key={col.label}
            className={cellPad}
            style={i < cols.length - 1 ? { borderRight: '0.5px solid var(--border-subtle)' } : undefined}
          >
            <div className={`text-fg-muted mb-1 ${isPostWrite ? 'text-[10px]' : 'text-[11px]'}`}>{col.label}</div>
            <div className={`font-mono font-medium ${isPostWrite ? 'text-[13px]' : 'text-[15px]'} ${col.color ?? 'text-fg-primary'}`}>{col.value}</div>
          </div>
        ))}
      </div>
      {hasHoldings && (
        <div className="flex justify-between px-3 py-2 font-mono text-[10px] text-fg-muted" style={{ borderTop: '0.5px solid var(--border-subtle)' }}>
          {data.holdings!.filter((h) => h.usdValue >= 0.01).slice(0, 4).map((h) => (
            <span key={h.symbol}>
              {h.symbol} {h.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              {h.usdValue > 0 ? ` · $${fmtUsd(h.usdValue)}` : ''}
            </span>
          ))}
        </div>
      )}
    </CardShell>
  );
}
