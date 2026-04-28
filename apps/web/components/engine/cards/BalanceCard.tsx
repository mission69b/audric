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
}

export function BalanceCard({ data }: { data: BalanceData }) {
  const cols: { label: string; value: string; color?: string }[] = [];
  if (data.total != null) cols.push({ label: 'Total', value: `$${fmtUsd(data.total)}` });
  if (data.available != null) cols.push({ label: 'Cash', value: `$${fmtUsd(data.available)}` });
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
  } else if (data.defiSource && data.defiSource !== 'blockvision') {
    // [v0.53.4] Surface unavailability rather than silently hiding the
    // column for ANY non-blockvision source with $0 total. `partial`
    // and `degraded` are both "we don't know" states — see the
    // `defiSource` JSDoc on `BalanceData` above for the bug rationale.
    cols.push({ label: 'DeFi', value: '—', color: 'text-fg-muted' });
  }
  if ((data.debt ?? 0) > 0) cols.push({ label: 'Debt', value: `$${fmtUsd(data.debt!)}`, color: 'text-warning-solid' });

  const hasHoldings = data.holdings && data.holdings.filter((h) => h.usdValue >= 0.01).length > 0;
  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? <AddressBadge address={data.address!} /> : undefined;

  return (
    <CardShell title="Balance" badge={badge} noPadding>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
      >
        {cols.map((col, i) => (
          <div
            key={col.label}
            className="px-3 py-2"
            style={i < cols.length - 1 ? { borderRight: '0.5px solid var(--border-subtle)' } : undefined}
          >
            <div className="text-[11px] text-fg-muted mb-1">{col.label}</div>
            <div className={`font-mono text-[15px] font-medium ${col.color ?? 'text-fg-primary'}`}>{col.value}</div>
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
