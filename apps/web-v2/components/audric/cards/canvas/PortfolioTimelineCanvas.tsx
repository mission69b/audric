"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { fmtUsd } from "../primitives";
import {
  CanvasButton,
  CanvasFooterMeta,
  CanvasMetric,
  CanvasMetricGrid,
  CanvasShell,
  RangeTabs,
} from "./canvas-shell";

interface TimelineData {
  available: true;
  address: string;
  isSelfRender?: boolean;
}

interface Snapshot {
  date: string;
  netWorthUsd: number;
  walletValueUsd: number;
  savingsValueUsd: number;
  debtValueUsd: number;
  defiValueUsd?: number;
  yieldEarnedUsd: number;
  healthFactor: number | null;
}

interface TimelineResponse {
  snapshots: Snapshot[];
  change: { period: string; absoluteUsd: number; percentChange: number };
}

interface Props {
  data: TimelineData | { available: false; message?: string };
  onAction?: (text: string) => void;
}

const PERIODS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
] as const;

const SERIES = [
  {
    key: "walletValueUsd" as const,
    label: "Wallet",
    color: "text-foreground",
  },
  {
    key: "savingsValueUsd" as const,
    label: "Savings",
    color: "text-success",
  },
  { key: "debtValueUsd" as const, label: "Debt", color: "text-destructive" },
];

function buildStackedPaths(
  snapshots: Snapshot[],
  W: number,
  H: number
): {
  lines: { key: string; color: string; points: string }[];
  maxVal: number;
} {
  if (snapshots.length === 0) {
    return { lines: [], maxVal: 0 };
  }

  const maxVal = Math.max(
    ...snapshots.map((s) => s.netWorthUsd + s.debtValueUsd),
    1
  );

  const lines: { key: string; color: string; points: string }[] = SERIES.filter(
    (s) => s.key !== "debtValueUsd"
  ).map((series) => {
    const points = snapshots
      .map((s, i) => {
        const x = (i / Math.max(snapshots.length - 1, 1)) * W;
        const y = H - ((s[series.key] ?? 0) / maxVal) * H * 0.85;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { key: series.key, color: series.color, points };
  });

  const debtSeries = SERIES.find((s) => s.key === "debtValueUsd");
  if (debtSeries && snapshots.some((s) => s.debtValueUsd > 0)) {
    const points = snapshots
      .map((s, i) => {
        const x = (i / Math.max(snapshots.length - 1, 1)) * W;
        const y = H - (s.debtValueUsd / maxVal) * H * 0.85;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    lines.push({
      key: "debtValueUsd",
      color: debtSeries.color,
      points,
    });
  }

  return { lines, maxVal };
}

export function PortfolioTimelineCanvas({ data, onAction }: Props) {
  const [response, setResponse] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodIdx, setPeriodIdx] = useState(1);

  const address =
    data && typeof data === "object" && "available" in data && data.available
      ? data.address
      : null;
  const isSelfRender =
    data && typeof data === "object" && "available" in data && data.available
      ? (data.isSelfRender ?? true)
      : true;
  const period = PERIODS[periodIdx];

  useEffect(() => {
    if (!address) {
      return;
    }
    setLoading(true);
    authFetch(
      `/api/analytics/portfolio-history?days=${period.days}&address=${address}`
    )
      .then((r) => r.json())
      .then((d) => setResponse(d))
      .catch(() =>
        setResponse({
          snapshots: [],
          change: {
            period: `${period.days}d`,
            absoluteUsd: 0,
            percentChange: 0,
          },
        })
      )
      .finally(() => setLoading(false));
  }, [address, period.days]);

  const snapshots = useMemo(
    () => response?.snapshots ?? [],
    [response?.snapshots]
  );
  const change = response?.change;

  const W = 320;
  const H = 80;
  const { lines } = useMemo(
    () => buildStackedPaths(snapshots, W, H),
    [snapshots]
  );

  const latest =
    snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const started = snapshots.length > 0 ? snapshots[0].netWorthUsd : 0;

  if (
    !data ||
    typeof data !== "object" ||
    !("available" in data) ||
    !data.available
  ) {
    return (
      <CanvasShell eyebrow="Timeline" name="Net worth">
        <div className="flex flex-col items-center justify-center space-y-2 py-6 text-center">
          <span className="text-3xl">📈</span>
          <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
            {data &&
            typeof data === "object" &&
            "message" in data &&
            data.message
              ? data.message
              : "Portfolio timeline will be available once portfolio snapshot history is collected."}
          </p>
        </div>
      </CanvasShell>
    );
  }

  if (loading && !response) {
    return (
      <CanvasShell eyebrow="Timeline" name="Net worth">
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse font-mono text-muted-foreground text-xs">
            Loading portfolio history...
          </div>
        </div>
      </CanvasShell>
    );
  }

  if (snapshots.length === 0) {
    return (
      <CanvasShell eyebrow="Timeline" name="Net worth">
        <div className="flex flex-col items-center justify-center space-y-2 py-6 text-center">
          <span className="text-3xl">📈</span>
          <p className="font-medium text-foreground text-sm">No data yet</p>
          <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
            {isSelfRender
              ? "Portfolio snapshots are collected daily. Check back tomorrow for your first data point."
              : "No portfolio history is tracked for this address yet."}
          </p>
        </div>
      </CanvasShell>
    );
  }

  if (snapshots.length < 2) {
    return (
      <CanvasShell
        eyebrow="Timeline"
        footer={
          onAction ? (
            <>
              <CanvasFooterMeta>Single snapshot</CanvasFooterMeta>
              <CanvasButton
                onClick={() =>
                  onAction(
                    isSelfRender
                      ? "Give me a full financial report"
                      : `Give me a full portfolio overview of ${address}`
                  )
                }
                variant="secondary"
              >
                Full report →
              </CanvasButton>
            </>
          ) : undefined
        }
        name={`$${fmtUsd(latest?.netWorthUsd ?? 0)}`}
        summary={{ value: "1", label: "snapshot" }}
      >
        <div className="rounded-lg border border-border bg-muted px-3 py-6 text-center">
          <p className="mx-auto max-w-sm font-mono text-[11px] text-muted-foreground leading-relaxed">
            {isSelfRender
              ? "Your first snapshot is in. Check back tomorrow once we've collected a second data point and we'll start drawing the trend."
              : "We don't track historical snapshots for this wallet yet — only Audric users get a daily trendline. Showing the live snapshot only."}
          </p>
        </div>
      </CanvasShell>
    );
  }

  return (
    <CanvasShell
      controls={
        <RangeTabs
          onChange={(v) =>
            setPeriodIdx(PERIODS.findIndex((p) => p.label === v))
          }
          options={PERIODS.map((p) => p.label)}
          value={period.label}
        />
      }
      eyebrow="Timeline"
      footer={
        onAction ? (
          <>
            <CanvasFooterMeta>
              {change && change.absoluteUsd !== 0
                ? `${change.absoluteUsd >= 0 ? "+" : ""}$${fmtUsd(change.absoluteUsd)} (${change.percentChange >= 0 ? "+" : ""}${change.percentChange.toFixed(1)}%) over ${period.label}`
                : `Net worth · ${period.label}`}
            </CanvasFooterMeta>
            <CanvasButton
              onClick={() => onAction("Give me a full financial report")}
              variant="secondary"
            >
              Full report →
            </CanvasButton>
          </>
        ) : undefined
      }
      name={`Net worth · ${period.label}`}
    >
      <div className="relative rounded-[10px] border border-border bg-muted p-4">
        <span className="absolute top-3 left-4 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
          Net worth
        </span>
        <svg
          aria-label="Portfolio timeline chart"
          className="h-[150px] w-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${W} ${H}`}
        >
          {lines.map((line) => (
            <polyline
              className={line.color}
              fill="none"
              key={line.key}
              points={line.points}
              stroke="currentColor"
              strokeDasharray={line.key === "debtValueUsd" ? "4 2" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={line.key === "debtValueUsd" ? "1" : "1.5"}
            />
          ))}
        </svg>
        <div className="mt-2 flex gap-3 font-mono text-[9px]">
          {SERIES.map((s) => (
            <div className="flex items-center gap-1" key={s.key}>
              <div
                className={`h-0.5 w-2 rounded-full ${
                  s.color === "text-foreground"
                    ? "bg-foreground"
                    : s.color === "text-success"
                      ? "bg-success"
                      : "bg-destructive"
                }`}
              />
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <CanvasMetricGrid cols={4}>
          <CanvasMetric label="Started" value={`$${fmtUsd(started)}`} />
          <CanvasMetric
            label="Now"
            value={`$${fmtUsd(latest?.netWorthUsd ?? 0)}`}
          />
          <CanvasMetric
            label="Change"
            tone={
              change && change.percentChange >= 0
                ? "up"
                : change
                  ? "down"
                  : "default"
            }
            value={
              change
                ? `${change.percentChange >= 0 ? "+" : ""}${change.percentChange.toFixed(1)}%`
                : "—"
            }
          />
          <CanvasMetric
            label="From yield"
            value={`$${fmtUsd(latest?.yieldEarnedUsd ?? 0)}`}
          />
        </CanvasMetricGrid>
      </div>
    </CanvasShell>
  );
}
