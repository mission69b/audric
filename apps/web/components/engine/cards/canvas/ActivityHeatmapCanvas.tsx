'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

interface HeatmapData {
  available: true;
  address: string;
}

interface DayBucket {
  date: string;
  count: number;
  types: Record<string, number>;
}

interface HeatmapResponse {
  buckets: DayBucket[];
  summary: { totalEvents: number; activeDays: number; maxCount: number; periodDays: number };
}

interface Props {
  data: HeatmapData | { available: false; message?: string };
  onAction?: (text: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const CELL = 11;
const GAP = 2;

function intensityClass(count: number, max: number): string {
  if (count === 0) return 'bg-border/40';
  const ratio = count / Math.max(max, 1);
  if (ratio <= 0.25) return 'bg-success/30';
  if (ratio <= 0.5) return 'bg-success/50';
  if (ratio <= 0.75) return 'bg-success/70';
  return 'bg-success';
}

function buildGrid(buckets: DayBucket[]) {
  const map = new Map(buckets.map((b) => [b.date, b]));
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // Mon=0
  const totalWeeks = 53;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (totalWeeks - 1) * 7 - dayOfWeek);

  const weeks: { date: string; count: number; types: Record<string, number> }[][] = [];
  const monthLabels: { label: string; weekIdx: number }[] = [];
  let lastMonth = -1;

  for (let w = 0; w < totalWeeks; w++) {
    const week: { date: string; count: number; types: Record<string, number> }[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + w * 7 + d);

      if (cellDate > today) {
        week.push({ date: '', count: -1, types: {} });
        continue;
      }

      const dateStr = cellDate.toISOString().slice(0, 10);
      const bucket = map.get(dateStr);
      week.push({
        date: dateStr,
        count: bucket?.count ?? 0,
        types: bucket?.types ?? {},
      });

      const m = cellDate.getMonth();
      if (m !== lastMonth && d === 0) {
        monthLabels.push({ label: MONTHS[m], weekIdx: w });
        lastMonth = m;
      }
    }
    weeks.push(week);
  }

  return { weeks, monthLabels };
}

export function ActivityHeatmapCanvas({ data, onAction }: Props) {
  const [response, setResponse] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const address = 'available' in data && data.available ? data.address : null;

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/analytics/activity-heatmap?address=${address}&days=365`)
      .then((r) => r.json())
      .then((d) => setResponse(d))
      .catch(() => setResponse({ buckets: [], summary: { totalEvents: 0, activeDays: 0, maxCount: 0, periodDays: 365 } }))
      .finally(() => setLoading(false));
  }, [address]);

  const { weeks, monthLabels } = useMemo(
    () => buildGrid(response?.buckets ?? []),
    [response?.buckets],
  );

  const maxCount = response?.summary.maxCount ?? 1;

  useEffect(() => {
    if (scrollRef.current && response) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [response]);

  const handleCellClick = useCallback(
    (date: string) => {
      if (!date || !onAction) return;
      const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      onAction(`Show me what happened on ${formatted}`);
    },
    [onAction],
  );

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📊</span>
        <p className="text-sm text-foreground font-medium">Coming Soon</p>
        <p className="text-xs text-muted max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Activity heatmap requires an address.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-xs text-dim">Loading activity data...</div>
      </div>
    );
  }

  const gridWidth = weeks.length * (CELL + GAP);
  const gridHeight = 7 * (CELL + GAP);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 font-mono text-xs">
        <div>
          <span className="text-dim">Transactions</span>{' '}
          <span className="text-foreground font-medium">{response?.summary.totalEvents ?? 0}</span>
        </div>
        <div>
          <span className="text-dim">Active days</span>{' '}
          <span className="text-foreground font-medium">{response?.summary.activeDays ?? 0}</span>
        </div>
        <div>
          <span className="text-dim">Peak</span>{' '}
          <span className="text-foreground font-medium">{maxCount}/day</span>
        </div>
      </div>

      {/* Heatmap grid */}
      <div ref={scrollRef} className="relative overflow-x-auto scrollbar-none">
        {/* Month labels */}
        <div className="flex mb-1" style={{ paddingLeft: 24 }}>
          {monthLabels.map((m, i) => (
            <span
              key={`${m.label}-${i}`}
              className="font-mono text-[9px] text-dim absolute"
              style={{ left: 24 + m.weekIdx * (CELL + GAP) }}
            >
              {m.label}
            </span>
          ))}
        </div>

        <div className="flex mt-4" style={{ position: 'relative' }}>
          {/* Day labels */}
          <div className="flex flex-col shrink-0" style={{ width: 22, gap: GAP }}>
            {DAYS.map((d, i) => (
              <div key={i} className="font-mono text-[9px] text-dim flex items-center" style={{ height: CELL }}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {week.map((cell, di) => (
                  <div
                    key={`${wi}-${di}`}
                    className={`rounded-[2px] transition-colors ${
                      cell.count < 0
                        ? 'bg-transparent'
                        : `${intensityClass(cell.count, maxCount)} ${cell.date ? 'cursor-pointer hover:ring-1 hover:ring-foreground/30' : ''}`
                    }`}
                    style={{ width: CELL, height: CELL }}
                    onMouseEnter={(e) => {
                      if (cell.count < 0 || !cell.date) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredCell({ date: cell.date, count: cell.count, x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => cell.date && handleCellClick(cell.date)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {hoveredCell && (
          <div
            className="fixed z-50 px-2 py-1 rounded bg-foreground text-background text-[10px] font-mono pointer-events-none whitespace-nowrap"
            style={{ left: hoveredCell.x, top: hoveredCell.y - 28 }}
          >
            {hoveredCell.count} transaction{hoveredCell.count !== 1 ? 's' : ''} on{' '}
            {new Date(hoveredCell.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 font-mono text-[9px] text-dim">
        <span>Less</span>
        <div className="w-[11px] h-[11px] rounded-[2px] bg-border/40" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success/30" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success/50" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success/70" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success" />
        <span>More</span>
      </div>
    </div>
  );
}
