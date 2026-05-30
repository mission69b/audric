"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * MetricBlock — label / value / sublabel (+ optional delta pill).
 *
 * [R6.4 / A1 — 2026-05-30] Built to the phase2 spec
 * (`t2000-AFI/audric/phase2-tool-blocks.html` §1 `.metric`): mono
 * uppercase label (10.5px), large mono tabular value (26px, weight 500),
 * mono sublabel row (11px) with an optional up/down delta pill.
 */
interface MetricDelta {
  direction: "up" | "down";
  value: string;
}

interface MetricBlockProps {
  className?: string;
  delta?: MetricDelta;
  label: string;
  sub?: ReactNode;
  /** `sm` shrinks the value to 20px (composition grids). Default `md` = 26px. */
  size?: "md" | "sm";
  value: ReactNode;
}

export function MetricBlock({
  label,
  value,
  sub,
  delta,
  size = "md",
  className,
}: MetricBlockProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </span>
      <span
        className={cn(
          "font-medium font-mono text-foreground leading-none tabular-nums tracking-[-0.022em]",
          size === "sm" ? "text-[20px]" : "text-[26px]"
        )}
      >
        {value}
      </span>
      {(sub || delta) && (
        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
          {delta && (
            <span
              className={cn(
                "rounded-[3px] px-1.5 py-px font-mono text-[11px] tabular-nums",
                delta.direction === "up"
                  ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-success"
                  : "bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] text-destructive"
              )}
            >
              {delta.value}
            </span>
          )}
          {sub}
        </span>
      )}
    </div>
  );
}
