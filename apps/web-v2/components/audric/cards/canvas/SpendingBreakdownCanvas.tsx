"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { fmtUsd } from "../primitives";
import {
  CanvasButton,
  CanvasFooterMeta,
  CanvasShell,
  RangeTabs,
} from "./canvas-shell";

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

  const address =
    data && typeof data === "object" && "available" in data && data.available
      ? data.address
      : null;
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

  const periodLabel = PERIOD_TABS[periodIdx].label;

  if (
    !data ||
    typeof data !== "object" ||
    !("available" in data) ||
    !data.available
  ) {
    return (
      <CanvasShell eyebrow="Spending" name="Breakdown">
        <div className="flex flex-col items-center justify-center space-y-2 py-6 text-center">
          <span className="text-3xl">💸</span>
          <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
            {data &&
            typeof data === "object" &&
            "message" in data &&
            data.message
              ? data.message
              : "Spending breakdown requires wallet data."}
          </p>
        </div>
      </CanvasShell>
    );
  }

  if (loading && !response) {
    return (
      <CanvasShell eyebrow="Spending" name="Breakdown">
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse font-mono text-muted-foreground text-xs">
            Loading spending data...
          </div>
        </div>
      </CanvasShell>
    );
  }

  const total = response?.totalSpent ?? 0;
  const requests = response?.requestCount ?? 0;

  return (
    <CanvasShell
      controls={
        <RangeTabs
          onChange={(v) =>
            setPeriodIdx(PERIOD_TABS.findIndex((p) => p.label === v))
          }
          options={PERIOD_TABS.map((p) => p.label)}
          value={periodLabel}
        />
      }
      eyebrow="Spending"
      footer={
        onAction && total > 0 ? (
          <>
            <CanvasFooterMeta>
              {requests > 0
                ? `Avg $${(total / requests).toFixed(3)} / request`
                : "API usage"}
            </CanvasFooterMeta>
            <CanvasButton
              onClick={() =>
                onAction("What APIs have I used and how much did each cost?")
              }
              variant="secondary"
            >
              Detailed breakdown →
            </CanvasButton>
          </>
        ) : undefined
      }
      name={`${periodLabel} · $${total < 1000 ? total.toFixed(2) : fmtUsd(total)} out`}
    >
      <div className="flex items-center gap-7">
        <svg
          aria-label="Spending breakdown donut"
          className="h-[130px] w-[130px] shrink-0"
          role="img"
          viewBox="0 0 100 100"
        >
          {segments.length > 0 ? (
            segments.map((seg) => (
              <path
                d={arcPath(50, 50, 38, seg.startAngle, seg.endAngle - 0.5)}
                fill="none"
                key={seg.category}
                stroke={seg.color}
                strokeLinecap="round"
                strokeWidth="9"
              />
            ))
          ) : (
            <circle
              className="text-muted"
              cx="50"
              cy="50"
              fill="none"
              r="38"
              stroke="currentColor"
              strokeWidth="9"
            />
          )}
          <text
            className="fill-foreground font-medium font-mono text-[11px]"
            textAnchor="middle"
            x="50"
            y="47"
          >
            ${total < 1000 ? total.toFixed(2) : fmtUsd(total)}
          </text>
          <text
            className="fill-muted-foreground font-mono text-[7px]"
            textAnchor="middle"
            x="50"
            y="58"
          >
            {requests} req{requests !== 1 ? "s" : ""}
          </text>
        </svg>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {segments.map((seg) => (
            <div
              className="grid grid-cols-[12px_1fr_auto] items-center gap-3"
              key={seg.category}
            >
              <span
                className="h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate font-medium text-[13px] tracking-[-0.011em]">
                {seg.category}
              </span>
              <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
                {seg.percent.toFixed(0)}%
              </span>
            </div>
          ))}
          {segments.length === 0 && (
            <p className="font-mono text-muted-foreground text-xs">
              No spending recorded
            </p>
          )}
        </div>
      </div>

      {response?.byService && response.byService.length > 0 && (
        <div className="mt-4 flex flex-col gap-1 border-border border-t pt-3 font-mono text-[11px]">
          {response.byService.slice(0, 5).map((s) => (
            <div className="flex justify-between" key={s.endpoint}>
              <span className="mr-2 truncate text-muted-foreground">
                {s.service}
              </span>
              <span className="shrink-0 text-foreground">
                ${s.totalSpent.toFixed(2)} ({s.requestCount}x)
              </span>
            </div>
          ))}
          {response.byService.length > 5 && (
            <p className="pt-0.5 text-center text-muted-foreground">
              + {response.byService.length - 5} more
            </p>
          )}
        </div>
      )}
    </CanvasShell>
  );
}
