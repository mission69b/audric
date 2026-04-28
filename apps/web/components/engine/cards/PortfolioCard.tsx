'use client';

import { CardShell, DetailRow, Gauge, MiniBar, StatusBadge, TrendIndicator, fmtUsd } from './primitives';

interface PortfolioData {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  /**
   * [Bug — 2026-04-28] Surface DeFi positions (Cetus LPs, Bluefin, Suilend,
   * etc.) on the card. Pre-fix this tool dropped DeFi entirely from the
   * breakdown, so a wallet with $1,569 in Cetus LPs reported $228 total
   * here while balance_check (correctly DeFi-aware) reported $1,797 —
   * the two cards in the same chat session contradicted each other on
   * the same wallet. Optional on the wire so a stale audric deploy
   * (engine pre-fix) doesn't crash the card.
   */
  defiValue?: number;
  defiSource?: 'blockvision' | 'partial' | 'partial-stale' | 'degraded';
  debtValue: number;
  healthFactor: number | null;
  allocations: { symbol: string; amount: number; usdValue: number; percentage: number }[];
  stablePercentage: number;
  insights: { type: string; message: string }[];
  savingsApy?: number;
  dailyEarning?: number;
  weekChange?: { absoluteUsd: number; percentChange: number };
}

function hfStatus(hf: number): 'healthy' | 'warning' | 'danger' | 'critical' {
  if (hf < 1.2) return 'critical';
  if (hf < 1.5) return 'danger';
  if (hf < 2.0) return 'warning';
  return 'healthy';
}

function fmtApy(rate: number | undefined): string {
  if (rate == null || rate <= 0) return '';
  const pct = rate < 1 ? rate * 100 : rate;
  return `${pct.toFixed(2)}% APY`;
}

export function PortfolioCard({ data }: { data: PortfolioData }) {
  const topAllocations = data.allocations.slice(0, 4);
  const segments = topAllocations.map((a) => ({
    label: a.symbol,
    value: a.usdValue,
    percentage: a.percentage,
  }));

  return (
    <CardShell title="Your Portfolio">
      {/* Hero: Total value + trend */}
      <div className="text-center mb-2">
        <span className="text-2xl font-semibold font-mono text-fg-primary">
          ${fmtUsd(data.totalValue)}
        </span>
        {data.weekChange && data.weekChange.absoluteUsd !== 0 && (
          <div className="mt-0.5">
            <TrendIndicator value={data.weekChange.percentChange} />
            <span className="text-fg-muted text-[10px] ml-1">this week</span>
          </div>
        )}
      </div>

      {/* Allocation bar */}
      {segments.length > 0 && (
        <div className="mb-3">
          <MiniBar segments={segments} />
        </div>
      )}

      {/* Breakdown rows */}
      <div className="space-y-1.5 font-mono text-[11px]">
        <DetailRow label="Wallet">${fmtUsd(data.walletValue)}</DetailRow>

        <DetailRow label="Savings">
          <span>${fmtUsd(data.savingsValue)}</span>
          {data.savingsApy ? (
            <span className="text-fg-muted ml-1 text-[10px]">
              {fmtApy(data.savingsApy)}
              {data.dailyEarning ? ` · $${data.dailyEarning.toFixed(4)}/day` : ''}
            </span>
          ) : null}
        </DetailRow>

        {/*
          [Bug — 2026-04-28] DeFi row. Render whenever the engine returned
          a positive value, regardless of source — `'partial'` and
          `'partial-stale'` still represent real on-chain value, just with
          provenance caveats. The accompanying insights array (engine-side)
          surfaces the warning copy so we don't double up here.
        */}
        {(data.defiValue ?? 0) > 0 && (
          <DetailRow label="DeFi">
            <span>${fmtUsd(data.defiValue!)}</span>
            {data.defiSource === 'partial' ? (
              <span className="text-warning-solid ml-1 text-[10px]">(partial)</span>
            ) : data.defiSource === 'partial-stale' ? (
              <span className="text-warning-solid ml-1 text-[10px]">(cached)</span>
            ) : null}
          </DetailRow>
        )}

        {data.debtValue > 0 && (
          <>
            <DetailRow label="Debt">
              <span className="text-warning-solid">-${fmtUsd(data.debtValue)}</span>
            </DetailRow>
            {data.healthFactor != null && Number.isFinite(data.healthFactor) && (
              <div className="pl-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-fg-muted">HF {data.healthFactor.toFixed(2)}</span>
                  <StatusBadge status={hfStatus(data.healthFactor)} />
                </div>
                <Gauge value={data.healthFactor} min={0} max={5} />
              </div>
            )}
          </>
        )}

        <div className="pt-1 border-t border-border-subtle/50">
          <DetailRow label="Net Worth">
            <span className="font-medium">${fmtUsd(data.totalValue)}</span>
          </DetailRow>
        </div>
      </div>

      {/* Insights callout */}
      {data.insights.length > 0 && (
        <div className="space-y-1 pt-2 mt-2 border-t border-border-subtle/50 text-[11px]">
          {data.insights.map((i, idx) => (
            <div key={idx} className={i.type === 'warning' ? 'text-warning-solid' : 'text-fg-muted'}>
              {i.type === 'warning' ? '⚠ ' : '→ '}{i.message}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
