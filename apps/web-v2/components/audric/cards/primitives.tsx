"use client";

import type { ReactNode } from "react";

/**
 * Audric card primitives — shared chrome / formatters used by every
 * card under `components/audric/cards/*`.
 *
 * Ported into web-v2 by Phase 5a.1 (renderer migration sweep,
 * 2026-05-19) from `apps/web/components/engine/cards/primitives.tsx`.
 * Verbatim copy except:
 *  - `import React from 'react'` → typed-only `import type {ReactNode}`
 *    (web-v2 uses React 19 automatic JSX runtime).
 *  - No engineering changes to behaviour. (R6.3 — 2026-05-30 — the
 *    Agentic Design System tokens these classes referenced were
 *    migrated to Geist DS shadcn tokens; see `app/globals.css`.)
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 5 — Renderer migration sweep".
 */

/**
 * [SPEC 23B-W1] `noHeader` skips the title chrome entirely. Used by the
 * post-write `BalanceCard` variant: the parent surface
 * (`<PostWriteRefreshSurface>`) already shows
 * "↻ AFTER YOUR APPROVAL · REFRESHING STATE", so a duplicate "Balance"
 * title bar 4px below it is wasted vertical space. With `noHeader: true`
 * the card collapses to just the body — wrapped in the same border/radius/
 * background so it still reads as a card, just unframed at the top.
 *
 * IMPORTANT — `badge` is silently dropped when `noHeader: true` because
 * the badge slot lives inside the header chrome that's being skipped.
 */
export function CardShell({
  title,
  badge,
  children,
  noPadding,
  noHeader,
  live,
  footer,
}: {
  badge?: ReactNode;
  children: ReactNode;
  /** [R6.3] Renders the eyebrow status dot in cyan `--signal` (live feed). */
  live?: boolean;
  /** [R6.3] Optional dashed-top footer slot (spec `.card-f`). */
  footer?: ReactNode;
  noHeader?: boolean;
  noPadding?: boolean;
  title: string;
}) {
  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-border bg-card">
      {!noHeader && (
        <div className="flex items-center justify-between border-border border-b px-[18px] py-[13px]">
          <span className="inline-flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            <span
              className={
                live
                  ? "h-1 w-1 rounded-full bg-signal shadow-[0_0_0_3px_var(--signal-bg)]"
                  : "h-1 w-1 rounded-full bg-muted-foreground"
              }
            />
            {title}
          </span>
          {badge}
        </div>
      )}
      {noPadding ? children : <div className="px-[18px] py-4 text-xs">{children}</div>}
      {footer && (
        <div className="flex items-center justify-between border-border border-t border-dashed px-[18px] py-[11px] font-mono text-[11px] text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

export function DetailRow({
  label,
  children,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}

export function MonoLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] text-muted-foreground uppercase tracking-widest${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}

/**
 * [v0.49] Watched-address chip — slot into CardShell's `badge` prop
 * when `isSelfQuery === false`. Truncated 0x is replaced by the SuiNS
 * name when the engine resolved one (`suinsName`).
 */
export function AddressBadge({
  address,
  suinsName,
}: {
  address: string;
  suinsName?: string | null;
}) {
  const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const label = suinsName ?? truncated;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-[0.08em]"
      style={{
        background: "var(--muted)",
        border: "0.5px solid var(--border)",
      }}
      title={suinsName ? `${suinsName} · ${address}` : address}
    >
      <span className="inline-block h-1 w-1 rounded-full bg-warning" />
      {label}
    </span>
  );
}

export function TrendIndicator({
  value,
  suffix = "%",
}: {
  suffix?: string;
  value: number;
}) {
  if (value === 0) {
    return <span className="text-muted-foreground">0{suffix}</span>;
  }
  const isPositive = value > 0;
  return (
    <span className={isPositive ? "text-success" : "text-destructive"}>
      {isPositive ? "▲" : "▼"} {isPositive ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

interface MiniBarSegment {
  label: string;
  percentage: number;
  value: number;
}

export function MiniBar({ segments }: { segments: MiniBarSegment[] }) {
  const colors = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"];
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-border">
        {segments.map((s, i) => (
          <div
            className={`${colors[i % colors.length]} transition-all`}
            key={s.label}
            style={{ width: `${s.percentage}%` }}
          />
        ))}
      </div>
      <div className="flex gap-3 font-mono text-[10px] text-muted-foreground">
        {segments.slice(0, 4).map((s, i) => (
          <span className="flex items-center gap-1" key={s.label}>
            <span
              className={`inline-block h-1.5 w-1.5 rounded-sm ${colors[i % colors.length]}`}
            />
            {s.label} {s.percentage.toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

type GaugeColorFn = (value: number) => string;

const GAUGE_COLOR_HF: GaugeColorFn = (v) => {
  if (v < 1.1) {
    return "var(--destructive)";
  }
  if (v < 1.5) {
    return "var(--warning)";
  }
  if (v < 2.0) {
    return "var(--warning)";
  }
  return "var(--success)";
};

const GAUGE_COLOR_USAGE: GaugeColorFn = (v) => {
  if (v > 0.9) {
    return "var(--destructive)";
  }
  if (v > 0.7) {
    return "var(--warning)";
  }
  return "var(--success)";
};

interface GaugeProps {
  colorMode?: "health_factor" | "usage";
  max?: number;
  min?: number;
  thresholds?: { label: string; value: number }[];
  value: number;
}

export function Gauge({
  value,
  min = 0,
  max = 5,
  thresholds,
  colorMode = "health_factor",
}: GaugeProps) {
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1) * 100;
  const colorFn = colorMode === "usage" ? GAUGE_COLOR_USAGE : GAUGE_COLOR_HF;

  return (
    <div className="space-y-1">
      <div className="relative h-2 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full transition-all"
          style={{
            background: colorFn(value),
            width: `${pct}%`,
          }}
        />
        {thresholds?.map((t) => {
          const tPct = Math.min(Math.max((t.value - min) / (max - min), 0), 1) * 100;
          return (
            <div
              className="absolute top-0 h-full w-px bg-foreground/40"
              key={t.label}
              style={{ left: `${tPct}%` }}
              title={t.label}
            />
          );
        })}
      </div>
      {thresholds && thresholds.length > 0 && (
        <div
          className={`flex ${thresholds.length === 1 ? "justify-end" : "justify-between"} font-mono text-[9px] text-muted-foreground`}
        >
          {thresholds.map((t) => (
            <span key={t.label}>{t.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({
  status,
}: {
  status: "healthy" | "warning" | "danger" | "critical";
}) {
  const config = {
    critical: {
      color: "bg-destructive animate-pulse",
      label: "Critical",
      text: "text-destructive",
    },
    danger: {
      color: "bg-destructive",
      label: "Danger",
      text: "text-destructive",
    },
    healthy: {
      color: "bg-success",
      label: "Healthy",
      text: "text-success",
    },
    warning: {
      color: "bg-warning",
      label: "Warning",
      text: "text-warning",
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.color}`} />
      {c.label}
    </span>
  );
}

export const SUISCAN_TX_URL = "https://suiscan.xyz/mainnet/tx";

export const SUISCAN_ICON = (
  <svg
    aria-hidden="true"
    className="inline-block"
    fill="none"
    height="10"
    viewBox="0 0 12 12"
    width="10"
  >
    <title>External link</title>
    <path
      d="M3.5 1.5H10.5V8.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
    <path
      d="M10.5 1.5L1.5 10.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

export function SuiscanLink({ digest }: { digest: string }) {
  const txUrl = `${SUISCAN_TX_URL}/${digest}`;
  const shortTx = `${digest.slice(0, 8)}...${digest.slice(-6)}`;
  return (
    <div className="mt-1.5 flex items-center justify-between border-border border-t pt-1.5 font-mono text-[11px]">
      <span className="text-muted-foreground">{shortTx}</span>
      <a
        className="flex items-center gap-1 text-[10px] text-foreground transition hover:opacity-70"
        href={txUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        View on Suiscan
        {SUISCAN_ICON}
      </a>
    </div>
  );
}

export function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

/**
 * [SPEC 23B-polish, 2026-05-11] Yield-formatting helper. Floors any
 * positive sub-cent value to `< $0.01` instead of rendering `$0.00`,
 * which is misleading (looks like nothing was earned).
 */
export function fmtYield(val: number): string {
  if (val > 0 && fmtUsd(val) === "0.00") {
    return "< $0.01";
  }
  return `$${fmtUsd(val)}`;
}

export function fmtPct(n: number): string {
  return (n * 100).toFixed(2);
}

export function fmtAmt(n: number, decimals = 2): string {
  if (n < 1 && n > 0) {
    return n.toFixed(6);
  }
  return n.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function fmtTvl(tvl: number): string {
  if (tvl >= 1e9) {
    return `$${(tvl / 1e9).toFixed(1)}B`;
  }
  if (tvl >= 1e6) {
    return `$${(tvl / 1e6).toFixed(1)}M`;
  }
  if (tvl >= 1e3) {
    return `$${(tvl / 1e3).toFixed(0)}K`;
  }
  return `$${tvl.toFixed(0)}`;
}

export function fmtRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

/**
 * Engine tools wrap most read results as `{ success: true, data: T }`.
 * `extractData` peels the wrapper so cards can be props-typed on the
 * inner shape and not have to care about the envelope.
 */
export function extractData(result: unknown): unknown {
  if (result && typeof result === "object" && "data" in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}
