'use client';

import React from 'react';

export function CardShell({ title, badge, children, noPadding }: { title: string; badge?: React.ReactNode; children: React.ReactNode; noPadding?: boolean }) {
  return (
    <div className="rounded-md overflow-hidden my-1.5" style={{ border: '0.5px solid var(--border)', background: 'var(--n800)' }}>
      <div className="px-3 py-1.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-dim">{title}</span>
        {badge}
      </div>
      {noPadding ? children : <div className="px-3 py-2 text-xs">{children}</div>}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-dim">{label}</span>
      <span className="text-foreground text-right">{children}</span>
    </div>
  );
}

export function MonoLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] font-mono uppercase tracking-widest text-dim${className ? ` ${className}` : ''}`}>{children}</span>;
}

export function TrendIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-dim">0{suffix}</span>;
  const isPositive = value > 0;
  return (
    <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
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
      <div className="flex h-2 rounded-full overflow-hidden bg-border/30">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className={`${colors[i % colors.length]} transition-all`}
            style={{ width: `${s.percentage}%` }}
          />
        ))}
      </div>
      <div className="flex gap-3 text-[10px] font-mono text-dim">
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
  v < 1.1 ? 'var(--status-danger)' : v < 1.5 ? 'var(--status-warning)' : v < 2.0 ? 'var(--status-warning)' : 'var(--status-healthy)';

const GAUGE_COLOR_USAGE: GaugeColorFn = (v) =>
  v > 0.9 ? 'var(--status-danger)' : v > 0.7 ? 'var(--status-warning)' : 'var(--status-healthy)';

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
      <div className="relative h-2 rounded-full overflow-hidden bg-border/30">
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
              className="absolute top-0 h-full w-px bg-foreground/40"
              style={{ left: `${tPct}%` }}
              title={t.label}
            />
          );
        })}
      </div>
      {thresholds && thresholds.length > 0 && (
        <div className={`flex ${thresholds.length === 1 ? 'justify-end' : 'justify-between'} text-[9px] font-mono text-dim`}>
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
    healthy: { color: 'bg-status-healthy', text: 'text-status-healthy', label: 'Healthy' },
    warning: { color: 'bg-status-warning', text: 'text-status-warning', label: 'Warning' },
    danger: { color: 'bg-status-danger', text: 'text-status-danger', label: 'Danger' },
    critical: { color: 'bg-status-danger animate-pulse', text: 'text-status-danger', label: 'Critical' },
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
    <div className="pt-1.5 mt-1.5 border-t border-border/50 flex justify-between items-center font-mono text-[11px]">
      <span className="text-dim">{shortTx}</span>
      <a
        href={txUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-info hover:opacity-70 transition text-[10px] flex items-center gap-1"
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
