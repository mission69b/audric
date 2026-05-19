"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { fmtUsd } from "../primitives";

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
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
  { label: "All", value: "all" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  "AI Images": "#10b981",
  Audio: "#6366f1",
  Mail: "#f59e0b",
  Search: "#3b82f6",
  Utilities: "#8b5cf6",
  Video: "#ec4899",
  Other: "#6b7280",
};

function buildDonutSegments(
  byService: ServiceEntry[],
  total: number
): {
  category: string;
  percent: number;
  color: string;
  startAngle: number;
  endAngle: number;
}[] {
  const byCategory = new Map<string, number>();
  for (const s of byService) {
    byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + s.totalSpent);
  }

  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const segments: {
    category: string;
    percent: number;
    color: string;
    startAngle: number;
    endAngle: number;
  }[] = [];
  let currentAngle = -90;

  for (const [category, spent] of sorted) {
    const percent = total > 0 ? (spent / total) * 100 : 0;
    const angle = (percent / 100) * 360;
    segments.push({
      category,
      percent,
      color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
    });
    currentAngle += angle;
  }

  return segments;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function SpendingBreakdownCanvas({ data, onAction }: Props) {
  const [response, setResponse] = useState<SpendingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodIdx, setPeriodIdx] = useState(1);

  const address = "available" in data && data.available ? data.address : null;
  const periodValue = PERIOD_TABS[periodIdx].value;

  useEffect(() => {
    if (!address) {
      return;
    }
    setLoading(true);
    authFetch(
      `/api/analytics/spending?period=${periodValue}&address=${address}`
    )
      .then((r) => r.json())
      .then((d) => setResponse(d))
      .catch(() =>
        setResponse({
          period: periodValue,
          totalSpent: 0,
          requestCount: 0,
          serviceCount: 0,
          byService: [],
        })
      )
      .finally(() => setLoading(false));
  }, [address, periodValue]);

  const segments = useMemo(
    () =>
      buildDonutSegments(
        response?.byService ?? [],
        response?.totalSpent ?? 0
      ),
    [response]
  );

  if (!("available" in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center space-y-2 py-10 text-center">
        <span className="text-3xl">💸</span>
        <p className="font-medium text-fg-primary text-sm">
          Spending Breakdown
        </p>
        <p className="max-w-xs text-fg-secondary text-xs leading-relaxed">
          {"message" in data && data.message
            ? data.message
            : "Spending breakdown requires wallet data."}
        </p>
      </div>
    );
  }

  if (loading && !response) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-pulse font-mono text-fg-muted text-xs">
          Loading spending data...
        </div>
      </div>
    );
  }

  const total = response?.totalSpent ?? 0;
  const requests = response?.requestCount ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {PERIOD_TABS.map((p, i) => (
          <button
            className={`flex-1 rounded py-1 font-mono text-[10px] uppercase tracking-wider transition ${
              periodIdx === i
                ? "bg-fg-primary text-fg-inverse"
                : "border border-border-subtle text-fg-secondary hover:border-fg-primary/30 hover:text-fg-primary"
            }`}
            key={p.value}
            onClick={() => setPeriodIdx(i)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <svg
            aria-label="Spending breakdown donut"
            height="100"
            role="img"
            viewBox="0 0 100 100"
            width="100"
          >
            {segments.length > 0 ? (
              segments.map((seg) => (
                <path
                  d={arcPath(50, 50, 38, seg.startAngle, seg.endAngle - 0.5)}
                  fill="none"
                  key={seg.category}
                  stroke={seg.color}
                  strokeLinecap="round"
                  strokeWidth="10"
                />
              ))
            ) : (
              <circle
                className="text-fg-disabled/40"
                cx="50"
                cy="50"
                fill="none"
                r="38"
                stroke="currentColor"
                strokeWidth="10"
              />
            )}
            <text
              className="fill-fg-primary font-medium font-mono text-[11px]"
              textAnchor="middle"
              x="50"
              y="46"
            >
              ${total < 1000 ? total.toFixed(2) : fmtUsd(total)}
            </text>
            <text
              className="fill-fg-muted font-mono text-[8px]"
              textAnchor="middle"
              x="50"
              y="58"
            >
              {requests} req{requests !== 1 ? "s" : ""}
            </text>
          </svg>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {segments.map((seg) => (
            <div
              className="flex items-center gap-2 font-mono text-xs"
              key={seg.category}
            >
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate text-fg-primary">{seg.category}</span>
              <span className="ml-auto shrink-0 text-fg-muted">
                {seg.percent.toFixed(0)}%
              </span>
            </div>
          ))}
          {segments.length === 0 && (
            <p className="font-mono text-fg-muted text-xs">
              No spending recorded
            </p>
          )}
        </div>
      </div>

      {response && response.byService.length > 0 && (
        <div className="space-y-1 font-mono text-xs">
          {response.byService.slice(0, 5).map((s) => (
            <div className="flex justify-between" key={s.endpoint}>
              <span className="mr-2 truncate text-fg-muted">{s.service}</span>
              <span className="shrink-0 text-fg-primary">
                ${s.totalSpent.toFixed(2)} ({s.requestCount}x)
              </span>
            </div>
          ))}
          {response.byService.length > 5 && (
            <p className="pt-0.5 text-center text-fg-muted">
              + {response.byService.length - 5} more
            </p>
          )}
        </div>
      )}

      {requests > 0 && (
        <div className="flex justify-between border-border-subtle/50 border-t pt-0.5 font-mono text-xs">
          <span className="text-fg-muted">Avg. per request</span>
          <span className="text-fg-primary">
            ${(total / requests).toFixed(3)}
          </span>
        </div>
      )}

      {onAction && total > 0 && (
        <button
          className="w-full rounded-md border border-border-subtle py-1.5 font-mono text-[10px] text-fg-secondary uppercase tracking-wider transition hover:border-fg-primary/30 hover:text-fg-primary"
          onClick={() =>
            onAction("What APIs have I used and how much did each cost?")
          }
          type="button"
        >
          Detailed breakdown →
        </button>
      )}
    </div>
  );
}
