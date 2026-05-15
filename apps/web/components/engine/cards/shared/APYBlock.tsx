'use client';

import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// Day 9 (b) — APYBlock (TOOL_UX_DESIGN_v07a.md, B+ plan)
//
// Shared render primitive used by 4 engine tools (post-Day-10 migration):
//   save_deposit       (target pool APY in the preview body),
//   withdraw           (yield foregone in the preview body),
//   portfolio_analysis (per-pool APY in the savings section),
//   rates_info         (USDC pool + USDsui pool comparison rows).
//
// Renders as `[asset] · 4.62% APY [↑7d / ↓7d / ·]`, with a small uppercase
// trend chip when a `trend` prop is supplied. APY input is in BASIS POINTS
// (engine convention) — the component does the bps→% formatting once so
// callers don't drift.
//
// Why a one-liner doesn't justify a component on its own: when 4 tools
// each render their own "USDC · 4.6% APY" span, font sizing / trend-chip
// styling / sub-cent rounding all drift across surfaces. Centralizing
// fixes the drift class permanently — cost of the component is ~50 LoC
// for a polish floor that Day 10+ migration relies on.
// ───────────────────────────────────────────────────────────────────────────

type TrendDirection = '7d_up' | '7d_down' | 'flat';

interface APYBlockProps {
  asset: string;
  /** APY in basis points (e.g. 462 = 4.62%). */
  apyBps: number;
  trend?: TrendDirection;
  /** Optional className extension. */
  className?: string;
}

function formatAPY(apyBps: number): string {
  if (!Number.isFinite(apyBps) || apyBps < 0) return '—';
  return `${(apyBps / 100).toFixed(2)}%`;
}

function trendArrow(t: TrendDirection): string {
  switch (t) {
    case '7d_up':
      return '↑ 7d';
    case '7d_down':
      return '↓ 7d';
    case 'flat':
      return '· flat';
  }
}

function trendColor(t: TrendDirection): string {
  switch (t) {
    case '7d_up':
      return 'text-success-solid';
    case '7d_down':
      return 'text-error-solid';
    case 'flat':
      return 'text-fg-muted';
  }
}

export function APYBlock({ asset, apyBps, trend, className }: APYBlockProps) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-2 font-mono tabular-nums',
        className,
      )}
    >
      <span className="text-[10px] uppercase tracking-wider text-fg-muted">
        {asset}
      </span>
      <span className="text-fg-primary text-sm">{formatAPY(apyBps)}</span>
      <span className="text-[9px] uppercase tracking-widest text-fg-muted">
        APY
      </span>
      {trend && (
        <span
          className={cn(
            'text-[9px] uppercase tracking-widest',
            trendColor(trend),
          )}
        >
          {trendArrow(trend)}
        </span>
      )}
    </span>
  );
}
