'use client';

import { useEffect, useState, useCallback } from 'react';

interface SpendingSummary {
  totalSpent: number;
  requestCount: number;
  serviceCount: number;
  period: string;
  byService: Array<{ service: string; totalSpent: number; requestCount: number }>;
}

interface SafetySectionProps {
  address: string | null;
}

export function SafetySection({ address }: SafetySectionProps) {
  const [spending, setSpending] = useState<SpendingSummary | null>(null);

  const fetchSpending = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/analytics/spending?period=month`, { headers: { 'x-sui-address': address } });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.totalSpent === 'number') setSpending(data);
      }
    } catch { /* ignore */ }
  }, [address]);

  useEffect(() => { fetchSpending(); }, [fetchSpending]);

  return (
    <section className="space-y-5">
      <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">Safety</h2>
      <p className="text-sm text-muted leading-relaxed">Control spending limits and transaction safety settings.</p>

      {spending && spending.requestCount > 0 && (
        <div className="rounded-xl border border-border bg-surface/50 p-4">
          <p className="text-xs text-muted uppercase tracking-wider mb-2">API usage \u2014 {spending.period}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground">${spending.totalSpent.toFixed(2)}</span>
            <span className="text-xs text-muted">across {spending.requestCount} calls to {spending.serviceCount} service{spending.serviceCount !== 1 ? 's' : ''}</span>
          </div>
          {spending.byService.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
              {spending.byService.slice(0, 5).map((s) => (
                <div key={s.service} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{s.service}</span>
                  <span className="text-foreground font-mono">${s.totalSpent.toFixed(2)} <span className="text-dim">({s.requestCount})</span></span>
                </div>
              ))}
              {spending.byService.length > 5 && (
                <p className="text-[10px] text-dim">+ {spending.byService.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-foreground">Daily API budget</p>
            <p className="text-xs text-muted mt-0.5">Maximum daily spend on MPP services</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-sm text-muted">$</span>
          <input
            type="number"
            min={0}
            step={0.1}
            defaultValue={1.00}
            className="w-24 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            onBlur={async (e) => {
              if (!address) return;
              const val = parseFloat(e.target.value);
              if (isNaN(val) || val < 0) return;
              try {
                await fetch('/api/user/preferences', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ address, limits: { dailyApiBudget: val } }),
                });
              } catch { /* ignore */ }
            }}
          />
          <span className="text-xs text-muted">per day</span>
        </div>
      </div>
    </section>
  );
}
