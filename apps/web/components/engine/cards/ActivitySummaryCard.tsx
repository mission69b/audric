'use client';

import { CardShell, DetailRow, MiniBar, fmtUsd } from './primitives';

interface ActionBreakdown {
  action: string;
  count: number;
  totalAmountUsd: number;
}

interface ActivityData {
  period: string;
  totalTransactions: number;
  byAction: ActionBreakdown[];
  totalMovedUsd: number;
  netSavingsUsd: number;
  yieldEarnedUsd: number;
}

function periodLabel(period: string): string {
  const now = new Date();
  switch (period) {
    case 'week': return 'This Week';
    case 'month': return now.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
    case 'year': return String(now.getFullYear());
    case 'all': return 'All Time';
    default: return period.toUpperCase();
  }
}

export function ActivitySummaryCard({ data }: { data: ActivityData }) {
  const total = data.totalTransactions;
  const segments = data.byAction.slice(0, 4).map((a) => ({
    label: a.action,
    value: a.count,
    percentage: total > 0 ? (a.count / total) * 100 : 0,
  }));

  return (
    <CardShell title={`${periodLabel(data.period)} Activity`}>
      <div className="text-center mb-2">
        <span className="text-2xl font-semibold font-mono text-fg-primary">
          {data.totalTransactions}
        </span>
        <p className="text-[10px] font-mono uppercase tracking-widest text-fg-muted mt-0.5">
          transactions
        </p>
      </div>

      {segments.length > 0 && (
        <div className="mb-3">
          <MiniBar segments={segments} />
        </div>
      )}

      <div className="space-y-1 font-mono text-[11px]">
        {data.byAction.map((a) => (
          <DetailRow key={a.action} label={a.action}>
            {a.count} · ${fmtUsd(a.totalAmountUsd)}
          </DetailRow>
        ))}
      </div>

      <div className="mt-2 pt-2 border-t border-border-subtle/50 space-y-1 font-mono text-[11px]">
        <DetailRow label="Total Moved">${fmtUsd(data.totalMovedUsd)}</DetailRow>
        <DetailRow label="Net Savings">${fmtUsd(data.netSavingsUsd)}</DetailRow>
        {data.yieldEarnedUsd > 0 && (
          <DetailRow label="Yield Earned">${fmtUsd(data.yieldEarnedUsd)}</DetailRow>
        )}
      </div>
    </CardShell>
  );
}
