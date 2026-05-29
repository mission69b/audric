"use client";

import { cn } from "@/lib/utils";
import { Gauge } from "../primitives";

/**
 * HFGauge — shared primitive used by health_check / borrow / withdraw
 * (when user has open borrows).
 *
 * Ported from `apps/web/components/engine/cards/shared/HFGauge.tsx` by
 * Phase 5a.1 (renderer migration sweep, 2026-05-19). Verbatim except
 * the `cn` import path.
 */
interface HFProjection {
  healthFactor: number;
  label: string;
}

interface HFGaugeProps {
  className?: string;
  healthFactor: number;
  liquidationThreshold: number;
  projection?: HFProjection;
}

function formatHF(hf: number): string {
  if (!Number.isFinite(hf) || hf >= 9999) {
    return "∞";
  }
  return hf.toFixed(2);
}

function projectionDirection(current: number, projected: number): "↑" | "↓" | "·" {
  if (projected > current + 0.001) {
    return "↑";
  }
  if (projected < current - 0.001) {
    return "↓";
  }
  return "·";
}

function projectionColor(hf: number): string {
  if (hf < 1.1) {
    return "text-destructive";
  }
  if (hf < 1.5) {
    return "text-warning";
  }
  return "text-success";
}

export function HFGauge({
  healthFactor,
  liquidationThreshold,
  projection,
  className,
}: HFGaugeProps) {
  const arrow = projection
    ? projectionDirection(healthFactor, projection.healthFactor)
    : null;
  const color = projection == null ? "" : projectionColor(projection.healthFactor);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Health factor
        </span>
        <span className="font-medium text-base text-foreground tabular-nums">
          {formatHF(healthFactor)}
        </span>
      </div>
      <Gauge
        colorMode="health_factor"
        max={5}
        min={0}
        thresholds={[{ label: "Liquidation", value: liquidationThreshold }]}
        value={healthFactor}
      />
      {projection && (
        <div className="flex items-baseline justify-between border-border border-t pt-1 text-xs">
          <span className="text-muted-foreground">{projection.label}</span>
          <span className={cn("font-mono tabular-nums", color)}>
            {arrow} {formatHF(projection.healthFactor)}
          </span>
        </div>
      )}
    </div>
  );
}
