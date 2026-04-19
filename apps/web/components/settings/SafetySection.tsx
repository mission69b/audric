'use client';

// [PHASE 10] Safety sub-section — re-skinned to match
// `design_handoff_audric/.../settings.jsx` Safety block.
//
// Layout:
//   • Description paragraph
//   • API USAGE card (sunken bg, mono eyebrow with month, large headline
//     amount + "across N calls to N services" sub-line, divider, then
//     per-service rows label/right-aligned value).
//   • DAILY API BUDGET card (sunken bg, mono eyebrow + description, then
//     $ + numeric input + "per day").
//
// Behavior preserved:
//   • `address` prop unchanged
//   • `fetch('/api/analytics/spending?period=month')` data shape untouched
//   • Daily-budget onBlur POST to `/api/user/preferences` untouched

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
      const res = await fetch(`/api/analytics/spending?period=month`, {
        headers: { 'x-sui-address': address },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.totalSpent === 'number') setSpending(data);
      }
    } catch {
      /* ignore */
    }
  }, [address]);

  useEffect(() => {
    fetchSpending();
  }, [fetchSpending]);

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[13px] text-fg-secondary mb-1.5">
        Control spending limits and transaction safety settings.
      </p>

      {spending && spending.requestCount > 0 && (
        <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
            API usage &mdash; {spending.period}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[22px] font-medium text-fg-primary tracking-[-0.01em]">
              ${spending.totalSpent.toFixed(2)}
            </span>
            <span className="text-[12px] text-fg-muted">
              across {spending.requestCount} call{spending.requestCount !== 1 ? 's' : ''} to{' '}
              {spending.serviceCount} service{spending.serviceCount !== 1 ? 's' : ''}
            </span>
          </div>
          {spending.byService.length > 0 && (
            <div className="mt-3.5 pt-3.5 border-t border-border-subtle flex flex-col gap-2">
              {spending.byService.slice(0, 5).map((s) => (
                <div key={s.service} className="flex items-center justify-between text-[13px]">
                  <span className="text-fg-secondary">{s.service}</span>
                  <span className="text-fg-primary">
                    ${s.totalSpent.toFixed(2)}{' '}
                    <span className="text-fg-muted">({s.requestCount})</span>
                  </span>
                </div>
              ))}
              {spending.byService.length > 5 && (
                <p className="text-[10px] text-fg-muted">+ {spending.byService.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Daily API budget
        </p>
        <p className="text-[12px] text-fg-secondary mt-1 mb-3.5">
          Maximum daily spend on MPP services
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-fg-muted">$</span>
          <input
            type="number"
            min={0}
            step={0.1}
            defaultValue={1.0}
            className="w-[60px] px-2.5 py-2 border border-border-strong rounded-sm text-[13px] text-fg-primary bg-surface-card outline-none focus:border-fg-primary transition"
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
              } catch {
                /* ignore */
              }
            }}
          />
          <span className="text-[13px] text-fg-muted">per day</span>
        </div>
      </div>
    </div>
  );
}
