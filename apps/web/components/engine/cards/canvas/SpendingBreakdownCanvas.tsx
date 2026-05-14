'use client';

import { useState, useEffect, useMemo } from 'react';
import { fmtUsd } from '../primitives';
import { authFetch } from '@/lib/auth-fetch';

interface SpendingData {
  available: true;
  address: string;
}

interface ServiceEntry {
  service: string;
  endpoint: string;
  category: string;
  totalSpent: number;
  requestCount: number;
}

interface SpendingResponse {
  period: string;
  totalSpent: number;
  requestCount: number;
  serviceCount: number;
  byService: ServiceEntry[];
}

interface Props {
  data: SpendingData | { available: false; message?: string };
  onAction?: (text: string) => void;
}

const PERIOD_TABS = [
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
  { label: 'All', value: 'all' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'AI Images': '#10b981',
  'Audio': '#6366f1',
  'Mail': '#f59e0b',
  'Search': '#3b82f6',
  'Utilities': '#8b5cf6',
  'Video': '#ec4899',
  'Other': '#6b7280',
};

function buildDonutSegments(
  byService: ServiceEntry[],
  total: number,
): { category: string; percent: number; color: string; startAngle: number; endAngle: number }[] {
  const byCategory = new Map<string, number>();
  for (const s of byService) {
    byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + s.totalSpent);
  }

  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const segments: { category: string; percent: number; color: string; startAngle: number; endAngle: number }[] = [];
  let currentAngle = -90; // Start from top

  for (const [category, spent] of sorted) {
    const percent = total > 0 ? (spent / total) * 100 : 0;
    const angle = (percent / 100) * 360;
    segments.push({
      category,
      percent,
      color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS['Other'],
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
    });
    currentAngle += angle;
  }

  return segments;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function SpendingBreakdownCanvas({ data, onAction }: Props) {
  const [response, setResponse] = useState<SpendingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodIdx, setPeriodIdx] = useState(1); // default month

  const address = 'available' in data && data.available ? data.address : null;
  const periodValue = PERIOD_TABS[periodIdx].value;

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    authFetch(`/api/analytics/spending?period=${periodValue}&address=${address}`)
      .then((r) => r.json())
      .then((d) => setResponse(d))
      .catch(() => setResponse({ period: periodValue, totalSpent: 0, requestCount: 0, serviceCount: 0, byService: [] }))
      .finally(() => setLoading(false));
  }, [address, periodValue]);

  const segments = useMemo(
    () => buildDonutSegments(response?.byService ?? [], response?.totalSpent ?? 0),
    [response],
  );

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">💸</span>
        <p className="text-sm text-fg-primary font-medium">Spending Breakdown</p>
        <p className="text-xs text-fg-secondary max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Spending breakdown requires wallet data.'}
        </p>
      </div>
    );
  }

  if (loading && !response) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-xs text-fg-muted">Loading spending data...</div>
      </div>
    );
  }

  const total = response?.totalSpent ?? 0;
  const requests = response?.requestCount ?? 0;

  return (
    <div className="space-y-4">
      {/* Period tabs */}
      <div className="flex gap-1">
        {PERIOD_TABS.map((p, i) => (
          <button
            key={p.value}
            onClick={() => setPeriodIdx(i)}
            className={`flex-1 rounded py-1 font-mono text-[10px] tracking-wider uppercase transition ${
              periodIdx === i
                ? 'bg-fg-primary text-fg-inverse'
                : 'border border-border-subtle text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Donut chart + total */}
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100">
            {segments.length > 0 ? (
              segments.map((seg, i) => (
                <path
                  key={i}
                  d={arcPath(50, 50, 38, seg.startAngle, seg.endAngle - 0.5)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="10"
                  strokeLinecap="round"
                />
              ))
            ) : (
              <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="10" className="text-fg-disabled/40" />
            )}
            <text x="50" y="46" textAnchor="middle" className="fill-fg-primary font-mono text-[11px] font-medium">
              ${total < 1000 ? total.toFixed(2) : fmtUsd(total)}
            </text>
            <text x="50" y="58" textAnchor="middle" className="fill-fg-muted font-mono text-[8px]">
              {requests} req{requests !== 1 ? 's' : ''}
            </text>
          </svg>
        </div>

        {/* Category legend */}
        <div className="space-y-1.5 flex-1 min-w-0">
          {segments.map((seg) => (
            <div key={seg.category} className="flex items-center gap-2 font-mono text-xs">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-fg-primary truncate">{seg.category}</span>
              <span className="ml-auto text-fg-muted shrink-0">{seg.percent.toFixed(0)}%</span>
            </div>
          ))}
          {segments.length === 0 && (
            <p className="font-mono text-xs text-fg-muted">No spending recorded</p>
          )}
        </div>
      </div>

      {/* Service breakdown */}
      {response && response.byService.length > 0 && (
        <div className="space-y-1 font-mono text-xs">
          {response.byService.slice(0, 5).map((s) => (
            <div key={s.endpoint} className="flex justify-between">
              <span className="text-fg-muted truncate mr-2">{s.service}</span>
              <span className="text-fg-primary shrink-0">
                ${s.totalSpent.toFixed(2)} ({s.requestCount}x)
              </span>
            </div>
          ))}
          {response.byService.length > 5 && (
            <p className="text-fg-muted text-center pt-0.5">+ {response.byService.length - 5} more</p>
          )}
        </div>
      )}

      {/* Avg cost */}
      {requests > 0 && (
        <div className="flex justify-between font-mono text-xs pt-0.5 border-t border-border-subtle/50">
          <span className="text-fg-muted">Avg. per request</span>
          <span className="text-fg-primary">${(total / requests).toFixed(3)}</span>
        </div>
      )}

      {/* Action */}
      {onAction && total > 0 && (
        <button
          onClick={() => onAction('What APIs have I used and how much did each cost?')}
          className="w-full rounded-md border border-border-subtle py-1.5 font-mono text-[10px] tracking-wider uppercase text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30 transition"
        >
          Detailed breakdown →
        </button>
      )}
    </div>
  );
}
