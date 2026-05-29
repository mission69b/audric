"use client";

import { cn } from "@/lib/utils";

/**
 * APYBlock — shared primitive used by save_deposit / withdraw /
 * portfolio_analysis / rates_info renderers.
 *
 * Ported from `apps/web/components/engine/cards/shared/APYBlock.tsx` by
 * Phase 5a.1 (renderer migration sweep, 2026-05-19). Verbatim except
 * the `cn` import path (`@/lib/cn` → `@/lib/utils`).
 */

type TrendDirection = "7d_up" | "7d_down" | "flat";

interface APYBlockProps {
  /** APY in basis points (e.g. 462 = 4.62%). */
  apyBps: number;
  asset: string;
  className?: string;
  trend?: TrendDirection;
}

function formatAPY(apyBps: number): string {
  if (!Number.isFinite(apyBps) || apyBps < 0) {
    return "—";
  }
  return `${(apyBps / 100).toFixed(2)}%`;
}

function trendArrow(t: TrendDirection): string {
  switch (t) {
    case "7d_up":
      return "↑ 7d";
    case "7d_down":
      return "↓ 7d";
    case "flat":
      return "· flat";
    default:
      return "";
  }
}

function trendColor(t: TrendDirection): string {
  switch (t) {
    case "7d_up":
      return "text-success";
    case "7d_down":
      return "text-destructive";
    case "flat":
      return "text-muted-foreground";
    default:
      return "";
  }
}

export function APYBlock({ asset, apyBps, trend, className }: APYBlockProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-2 font-mono tabular-nums",
        className,
      )}
    >
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {asset}
      </span>
      <span className="text-foreground text-sm">{formatAPY(apyBps)}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-widest">
        APY
      </span>
      {trend && (
        <span
          className={cn(
            "text-[9px] uppercase tracking-widest",
            trendColor(trend),
          )}
        >
          {trendArrow(trend)}
        </span>
      )}
    </span>
  );
}
