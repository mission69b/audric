'use client';

import React from 'react';

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
 * the badge slot lives inside the header chrome that's being skipped. This
 * is intentional and acceptable for the W1 use case: post-write refresh
 * clusters only fire after the user signs a write on their own wallet, so
 * `BalanceCard` in the PWR cluster always renders self-wallet data
 * (`isSelfQuery !== false`) and therefore has no badge to render. If a
 * future change wires watched-address reads into the PWR flow, callers
 * MUST surface the watched-address chip somewhere outside the body
 * themselves (the floating-badge layout would belong here).
 */
export function CardShell({
  title,
  badge,
  children,
  noPadding,
  noHeader,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
  noHeader?: boolean;
}) {
  return (
    <div className="my-1.5 rounded-md overflow-hidden border border-border-subtle bg-surface-card">
      {!noHeader && (
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-border-subtle bg-surface-sunken">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">{title}</span>
          {badge}
        </div>
      )}
      {noPadding ? children : <div className="px-3.5 py-2.5 text-xs">{children}</div>}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg-primary text-right">{children}</span>
    </div>
  );
}

export function MonoLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] font-mono uppercase tracking-widest text-fg-muted${className ? ` ${className}` : ''}`}>{children}</span>;
}

/**
 * [v0.49] Watched-address chip — slot into CardShell's `badge` prop
 * when `isSelfQuery === false`. Mirrors the truncated-address cue used
 * by ActivityHeatmapCanvas (PR #67) so a card showing a contact's /
 * watched-address position is visually distinguishable from one
 * showing the signed-in user's own.
 *
 * [v1.2 SuiNS] When `suinsName` is set (the user passed `address: "alex.sui"`
 * and the engine resolved it via Sui RPC), prefer the human-readable
 * name over the truncated 0x. Hover/title still surfaces the on-chain
 * address so the user can confirm exactly what's being inspected.
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
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.08em] text-fg-muted"
      style={{ border: '0.5px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}
      title={suinsName ? `${suinsName} · ${address}` : address}
    >
      <span className="inline-block w-1 h-1 rounded-full bg-warning-solid" />
      {label}
    </span>
  );
}

export function TrendIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-fg-muted">0{suffix}</span>;
  const isPositive = value > 0;
  return (
    <span className={isPositive ? 'text-success-solid' : 'text-error-solid'}>
      {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  );
}

interface MiniBarSegment {
  label: string;
  value: number;
  percentage: number;
}

export function MiniBar({ segments }: { segments: MiniBarSegment[] }) {
  const colors = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4'];
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-border-subtle">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className={`${colors[i % colors.length]} transition-all`}
            style={{ width: `${s.percentage}%` }}
          />
        ))}
      </div>
      <div className="flex gap-3 text-[10px] font-mono text-fg-muted">
        {segments.slice(0, 4).map((s, i) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-sm ${colors[i % colors.length]}`} />
            {s.label} {s.percentage.toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

type GaugeColorFn = (value: number) => string;

const GAUGE_COLOR_HF: GaugeColorFn = (v) =>
  v < 1.1 ? 'var(--error-solid)' : v < 1.5 ? 'var(--warning-solid)' : v < 2.0 ? 'var(--warning-solid)' : 'var(--success-solid)';

const GAUGE_COLOR_USAGE: GaugeColorFn = (v) =>
  v > 0.9 ? 'var(--error-solid)' : v > 0.7 ? 'var(--warning-solid)' : 'var(--success-solid)';

interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  thresholds?: { value: number; label: string }[];
  colorMode?: 'health_factor' | 'usage';
}

export function Gauge({ value, min = 0, max = 5, thresholds, colorMode = 'health_factor' }: GaugeProps) {
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1) * 100;
  const colorFn = colorMode === 'usage' ? GAUGE_COLOR_USAGE : GAUGE_COLOR_HF;

  return (
    <div className="space-y-1">
      <div className="relative h-2 rounded-full overflow-hidden bg-border-subtle">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: colorFn(value),
          }}
        />
        {thresholds?.map((t) => {
          const tPct = Math.min(Math.max((t.value - min) / (max - min), 0), 1) * 100;
          return (
            <div
              key={t.label}
              className="absolute top-0 h-full w-px bg-border-strong"
              style={{ left: `${tPct}%` }}
              title={t.label}
            />
          );
        })}
      </div>
      {thresholds && thresholds.length > 0 && (
        <div className={`flex ${thresholds.length === 1 ? 'justify-end' : 'justify-between'} text-[9px] font-mono text-fg-muted`}>
          {thresholds.map((t) => (
            <span key={t.label}>{t.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: 'healthy' | 'warning' | 'danger' | 'critical' }) {
  const config = {
    healthy: { color: 'bg-success-solid', text: 'text-success-solid', label: 'Healthy' },
    warning: { color: 'bg-warning-solid', text: 'text-warning-solid', label: 'Warning' },
    danger: { color: 'bg-error-solid', text: 'text-error-solid', label: 'Danger' },
    critical: { color: 'bg-error-solid animate-pulse', text: 'text-error-solid', label: 'Critical' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.color}`} />
      {c.label}
    </span>
  );
}

export const SUISCAN_TX_URL = 'https://suiscan.xyz/mainnet/tx';

export const SUISCAN_ICON = (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="inline-block">
    <path d="M3.5 1.5H10.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function SuiscanLink({ digest }: { digest: string }) {
  const txUrl = `${SUISCAN_TX_URL}/${digest}`;
  const shortTx = `${digest.slice(0, 8)}...${digest.slice(-6)}`;
  return (
    <div className="pt-1.5 mt-1.5 border-t border-border-subtle flex justify-between items-center font-mono text-[11px]">
      <span className="text-fg-muted">{shortTx}</span>
      <a
        href={txUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-info-solid hover:opacity-70 transition text-[10px] flex items-center gap-1"
      >
        View on Suiscan
        {SUISCAN_ICON}
      </a>
    </div>
  );
}

export function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n: number): string {
  return (n * 100).toFixed(2);
}

export function fmtAmt(n: number, decimals = 2): string {
  if (n < 1 && n > 0) return n.toFixed(6);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtTvl(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(1)}M`;
  if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(0)}K`;
  return `$${tvl.toFixed(0)}`;
}

export function fmtRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function extractData(result: unknown): unknown {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}
