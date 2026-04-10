'use client';

import { CardShell, DetailRow, Gauge, fmtUsd } from './primitives';

interface AllowanceData {
  enabled: boolean;
  dailyLimit: number;
  spent: number;
  remaining: number;
  permissions: string[];
  resetsAt?: string;
}

function fmtResetTime(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffH = Math.round(diffMs / 3_600_000);
    if (diffH <= 1) return 'in < 1 hour';
    if (diffH < 24) return `in ${diffH}h`;
    return 'tomorrow midnight';
  } catch {
    return iso;
  }
}

export function AllowanceCard({ data }: { data: AllowanceData }) {
  const usagePct = data.dailyLimit > 0 ? (data.spent / data.dailyLimit) : 0;

  return (
    <CardShell
      title="Agent Allowance"
      badge={
        <span className={`text-[10px] font-mono ${data.enabled ? 'text-emerald-400' : 'text-dim'}`}>
          {data.enabled ? 'Active' : 'Disabled'}
        </span>
      }
    >
      {data.enabled && (
        <>
          <div className="mb-2">
            <div className="flex justify-between text-[10px] font-mono mb-1">
              <span className="text-dim">Daily Budget</span>
              <span className="text-foreground">${fmtUsd(data.spent)} / ${fmtUsd(data.dailyLimit)}</span>
            </div>
            <Gauge value={usagePct} min={0} max={1} colorMode="usage" />
          </div>

          <div className="space-y-1 font-mono text-[11px]">
            <DetailRow label="Remaining">${fmtUsd(data.remaining)}</DetailRow>
            {data.resetsAt && (
              <DetailRow label="Resets">{fmtResetTime(data.resetsAt)}</DetailRow>
            )}
          </div>

          {data.permissions.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-border/50">
              <span className="text-[10px] font-mono text-dim block mb-1">Enabled Services</span>
              <div className="flex flex-wrap gap-1">
                {data.permissions.map((p) => (
                  <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-border/40 text-muted">{p}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!data.enabled && (
        <div className="text-center py-2 text-dim text-[11px]">
          Agent spending is disabled. Ask me to enable it.
        </div>
      )}
    </CardShell>
  );
}
