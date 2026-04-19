'use client';

import { CardShell, DetailRow, TrendIndicator, fmtTvl, fmtUsd } from './primitives';

interface ProtocolData {
  name: string;
  slug?: string;
  category?: string;
  chains?: string[];
  tvl: number;
  tvlChange1d?: number;
  tvlChange7d?: number;
  tvlChange30d?: number;
  mcap?: number | null;
  fees24h?: number | null;
  revenue24h?: number | null;
  auditCount?: number;
  auditLinks?: string[];
  url?: string;
  twitter?: string | null;
  riskFactors?: string[];
  safetyScore?: string | number;
}

function parseScore(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return isNaN(n) ? null : Math.min(Math.max(n, 0), 10);
}

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color =
    score >= 7 ? 'var(--success-solid)' : score >= 4 ? 'var(--warning-solid)' : 'var(--error-solid)';

  return (
    <div className="space-y-1">
      <div className="relative h-2 rounded-full overflow-hidden bg-border-subtle/30">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function ProtocolCard({ data }: { data: ProtocolData }) {
  const score = parseScore(data.safetyScore);

  return (
    <CardShell
      title={data.name}
      badge={data.category ? (
        <span className="text-[9px] font-mono uppercase text-fg-muted">{data.category}</span>
      ) : undefined}
    >
      {score !== null && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[11px] text-fg-muted">Safety Score</span>
            <span className="text-sm font-mono font-semibold text-fg-primary">{score.toFixed(0)}/10</span>
          </div>
          <ScoreBar score={score} />
        </div>
      )}

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="TVL">{fmtTvl(data.tvl)}</DetailRow>

        {data.tvlChange1d != null && (
          <DetailRow label="24h Change"><TrendIndicator value={data.tvlChange1d} /></DetailRow>
        )}
        {data.tvlChange7d != null && (
          <DetailRow label="7d Change"><TrendIndicator value={data.tvlChange7d} /></DetailRow>
        )}

        {data.fees24h != null && (
          <DetailRow label="Fees (24h)">${fmtUsd(data.fees24h)}</DetailRow>
        )}
        {data.revenue24h != null && (
          <DetailRow label="Revenue (24h)">${fmtUsd(data.revenue24h)}</DetailRow>
        )}

        {data.auditCount != null && data.auditCount > 0 && (
          <DetailRow label="Audits">{data.auditCount}</DetailRow>
        )}

        {data.chains && data.chains.length > 0 && (
          <DetailRow label="Chains">{data.chains.slice(0, 5).join(', ')}{data.chains.length > 5 ? ` +${data.chains.length - 5}` : ''}</DetailRow>
        )}
      </div>

      {data.riskFactors && data.riskFactors.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border-subtle/50 space-y-0.5">
          {data.riskFactors.map((risk, i) => (
            <div key={i} className="text-[10px] text-fg-muted flex items-start gap-1">
              <span className="text-warning-solid shrink-0">⚠</span>
              <span>{risk}</span>
            </div>
          ))}
        </div>
      )}

      {data.url && (
        <div className="mt-2 pt-1.5 border-t border-border-subtle/50">
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-info-solid hover:opacity-70 transition"
          >
            {data.url.replace(/^https?:\/\//, '')} ↗
          </a>
        </div>
      )}
    </CardShell>
  );
}
