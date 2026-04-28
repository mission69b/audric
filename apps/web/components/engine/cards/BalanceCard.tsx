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
   *   - 'blockvision' → all 9 protocols responded successfully
   *   - 'partial'     → at least one protocol failed; total may under-count
   *   - 'degraded'    → no API key OR every protocol failed; total UNKNOWN, not zero
   *
   * The card surfaces a "DeFi —" placeholder for ANY non-`blockvision`
   * source when total is 0 — both `partial` (some protocols 429'd, the
   * rest reported $0 but the missing slice could be > 0) and `degraded`
   * (every protocol failed) are "we don't know" states, not "we know
   * it's $0" states. Pre-v0.53.4 only `degraded` triggered the
   * placeholder; `partial` + 0 silently hid the row, which produced
   * the bug where `balance_check` reported $29,516.61 net worth for
   * a wallet whose DeFi was unreachable while the timeline canvas
   * (cache miss, fresh fetch) reported $36,995.14 with $7,478.54 of
   * DeFi visible — same SSOT drift the v0.53.x SSOT work was meant
   * to eliminate, just relocated into the partial-with-zero path.
   */
  defiSource?: 'blockvision' | 'partial' | 'degraded';
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
    cols.push({ label: 'DeFi', value: `$${fmtUsd(data.defi!)}`, color: 'text-success-solid' });
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
