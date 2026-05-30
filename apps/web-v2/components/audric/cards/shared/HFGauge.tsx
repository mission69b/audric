"use client";

import { cn } from "@/lib/utils";

/**
 * HFGauge — the health-factor dial. The ONE non-flat block.
 *
 * [R6.4 / A1 — 2026-05-30] Rebuilt to the phase2 spec
 * (`t2000-AFI/audric/phase2-tool-blocks.html` §6 `.hf`): a 96px circular
 * SVG gauge (replaces the former horizontal `Gauge` bar). The arc is
 * rotated -90deg, 6px round-capped stroke, colored by zone:
 *   Safe (>2) green · Watch (1.3–2) amber · At risk (<1.3) red.
 * Center shows the mono HF value + "HF" label; the zone caption sits
 * below the dial. Used by health_check / borrow / withdraw (when the
 * user has open borrows) + the HealthSimulator canvas.
 *
 * `liquidationThreshold` is still accepted for call-site compatibility
 * (health cards pass it) but the dial encodes risk via zone color, so
 * it is intentionally unused here.
 */
interface HFProjection {
  healthFactor: number;
  label: string;
}

interface HFGaugeProps {
  className?: string;
  healthFactor: number;
  liquidationThreshold?: number;
  projection?: HFProjection;
}

const GAUGE_RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

type Zone = "safe" | "warn" | "danger";

function zoneFor(hf: number): Zone {
  if (!Number.isFinite(hf) || hf > 2) {
    return "safe";
  }
  if (hf >= 1.3) {
    return "warn";
  }
  return "danger";
}

const ZONE_STROKE: Record<Zone, string> = {
  danger: "var(--destructive)",
  safe: "var(--success)",
  warn: "var(--warning)",
};

const ZONE_TEXT: Record<Zone, string> = {
  danger: "text-destructive",
  safe: "text-success",
  warn: "text-warning",
};

const ZONE_CAPTION: Record<Zone, string> = {
  danger: "At risk · <1.3",
  safe: "Safe · >2",
  warn: "Watch · 1.3–2",
};

function formatHF(hf: number): string {
  if (!Number.isFinite(hf) || hf >= 9999) {
    return "∞";
  }
  return hf.toFixed(2);
}

/** Maps HF → arc fill fraction. HF 1 = empty, HF 3+ = full. */
function fillFraction(hf: number): number {
  if (!Number.isFinite(hf)) {
    return 1;
  }
  return Math.min(Math.max((hf - 1) / 2, 0), 1);
}

function projectionDirection(
  current: number,
  projected: number
): "↑" | "↓" | "·" {
  if (projected > current + 0.001) {
    return "↑";
  }
  if (projected < current - 0.001) {
    return "↓";
  }
  return "·";
}

export function HFGauge({
  healthFactor,
  projection,
  className,
}: HFGaugeProps) {
  const zone = zoneFor(healthFactor);
  const dashoffset = CIRCUMFERENCE * (1 - fillFraction(healthFactor));

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
        <svg
          aria-hidden="true"
          className="h-full w-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            fill="none"
            r={GAUGE_RADIUS}
            stroke="var(--muted)"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            fill="none"
            r={GAUGE_RADIUS}
            stroke={ZONE_STROKE[zone]}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            strokeWidth="6"
            style={{ transition: "stroke-dashoffset 250ms var(--ease-smooth)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-medium font-mono text-[22px] leading-none tabular-nums tracking-[-0.022em]",
              zone === "danger" ? "text-destructive" : "text-foreground"
            )}
          >
            {formatHF(healthFactor)}
          </span>
          <span className="mt-1 font-mono text-[9.5px] text-muted-foreground uppercase tracking-[0.08em]">
            HF
          </span>
        </div>
      </div>
      <span
        className={cn(
          "font-mono text-[10.5px] uppercase tracking-[0.06em]",
          ZONE_TEXT[zone]
        )}
      >
        {ZONE_CAPTION[zone]}
      </span>
      {projection && (
        <div className="mt-1 flex w-full items-baseline justify-between border-border border-t pt-1.5 text-xs">
          <span className="text-muted-foreground">{projection.label}</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              ZONE_TEXT[zoneFor(projection.healthFactor)]
            )}
          >
            {projectionDirection(healthFactor, projection.healthFactor)}{" "}
            {formatHF(projection.healthFactor)}
          </span>
        </div>
      )}
    </div>
  );
}
