'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/auth-fetch';

interface HeatmapData {
  available: true;
  address: string;
  /**
   * [v0.48] Engine-provided flag indicating whether this canvas is
   * rendering the signed-in user's own wallet (true) or a third-party
   * address — saved contact, watched address, etc. (false). Drives the
   * cell-click action message: self-renders produce "Show my
   * transactions from <date>", non-self renders produce "Show
   * transactions for <0xshort> on <date>" so the followup query routes
   * to the correct address.
   *
   * Optional for backwards compat: an engine < 0.48 won't emit it, in
   * which case we infer self-render from the absence of the flag.
   */
  isSelfRender?: boolean;
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
  if (count === 0) return 'bg-border-subtle/40';
  const ratio = count / Math.max(max, 1);
  if (ratio <= 0.25) return 'bg-success-solid/30';
  if (ratio <= 0.5) return 'bg-success-solid/50';
  if (ratio <= 0.75) return 'bg-success-solid/70';
  return 'bg-success-solid';
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
  // Engines older than 0.48 omit this; absence == self-render (legacy behavior).
  const isSelfRender = 'available' in data && data.available ? (data.isSelfRender ?? true) : true;
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    authFetch(`/api/analytics/activity-heatmap?days=365&address=${address}`)
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
    (date: string, count: number) => {
      if (!date || !onAction) return;
      const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const txWord = `transaction${count !== 1 ? 's' : ''}`;
      // [v0.48 — bug 2 fix] When the heatmap renders a third-party
      // address (a contact / watched wallet), routing the cell click
      // back through "Show my transactions" sent the LLM hunting in
      // the user's own history — the bug the user reported. Now we
      // pass the watched address explicitly so the LLM forwards it to
      // transaction_history({ address, date }).
      const prompt = isSelfRender
        ? `Show my transactions from ${formatted} (${date}) — I had ${count} ${txWord} that day`
        : `Show transactions for ${address} on ${formatted} (${date}) — there ${count !== 1 ? 'were' : 'was'} ${count} ${txWord} that day`;
      onAction(prompt);
    },
    [onAction, isSelfRender, address],
  );

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📊</span>
        <p className="text-sm text-fg-primary font-medium">Coming Soon</p>
        <p className="text-xs text-fg-secondary max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Activity heatmap requires an address.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-xs text-fg-muted">Loading activity data...</div>
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
          <span className="text-fg-muted">Transactions</span>{' '}
          <span className="text-fg-primary font-medium">{response?.summary.totalEvents ?? 0}</span>
        </div>
        <div>
          <span className="text-fg-muted">Active days</span>{' '}
          <span className="text-fg-primary font-medium">{response?.summary.activeDays ?? 0}</span>
        </div>
        <div>
          <span className="text-fg-muted">Peak</span>{' '}
          <span className="text-fg-primary font-medium">{maxCount}/day</span>
        </div>
        {!isSelfRender && shortAddr && (
          <div>
            <span className="text-fg-muted">Address</span>{' '}
            <span className="text-fg-primary font-medium">{shortAddr}</span>
          </div>
        )}
      </div>

      {/* Heatmap grid */}
      <div ref={scrollRef} className="relative overflow-x-auto scrollbar-none">
        {/* Month labels */}
        <div className="flex mb-1" style={{ paddingLeft: 24 }}>
          {monthLabels.map((m, i) => (
            <span
              key={`${m.label}-${i}`}
              className="font-mono text-[9px] text-fg-muted absolute"
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
              <div key={i} className="font-mono text-[9px] text-fg-muted flex items-center" style={{ height: CELL }}>
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
                        : `${intensityClass(cell.count, maxCount)} ${cell.date ? 'cursor-pointer hover:ring-1 hover:ring-fg-primary/30' : ''}`
                    }`}
                    style={{ width: CELL, height: CELL }}
                    onMouseEnter={(e) => {
                      if (cell.count < 0 || !cell.date) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredCell({ date: cell.date, count: cell.count, x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => cell.date && handleCellClick(cell.date, cell.count)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {hoveredCell && (
          <div
            className="fixed z-50 px-2 py-1 rounded bg-fg-primary text-fg-inverse text-[10px] font-mono pointer-events-none whitespace-nowrap"
            style={{ left: hoveredCell.x, top: hoveredCell.y - 28 }}
          >
            {hoveredCell.count} transaction{hoveredCell.count !== 1 ? 's' : ''} on{' '}
            {new Date(hoveredCell.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 font-mono text-[9px] text-fg-muted">
        <span>Less</span>
        <div className="w-[11px] h-[11px] rounded-[2px] bg-border-subtle/40" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success-solid/30" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success-solid/50" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success-solid/70" />
        <div className="w-[11px] h-[11px] rounded-[2px] bg-success-solid" />
        <span>More</span>
      </div>
    </div>
  );
}
