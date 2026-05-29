"use client";

import { cn } from "@/lib/utils";

/**
 * RouteDiagram — shared primitive used by swap_quote / harvest_rewards
 * to render multi-hop Cetus / Aftermath / Turbos routes.
 *
 * Ported from `apps/web/components/engine/cards/shared/RouteDiagram.tsx`
 * by Phase 5a.1 (renderer migration sweep, 2026-05-19). Verbatim except
 * the `cn` import path.
 */

interface RouteStep {
  fee: string;
  fromAsset: string;
  pool: string;
  toAsset: string;
}

interface RouteDiagramProps {
  className?: string;
  steps: RouteStep[];
  totalFeeBps: number;
}

function AssetPill({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground uppercase tracking-wider">
      {symbol}
    </span>
  );
}

function StepArrow({ pool, fee }: { fee: string; pool: string }) {
  return (
    <span className="mx-1 inline-flex flex-col items-center">
      <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em]">
        {pool} · {fee}
      </span>
      <span
        aria-hidden="true"
        className="text-muted-foreground text-xs leading-none"
      >
        →
      </span>
    </span>
  );
}

export function RouteDiagram({
  steps,
  totalFeeBps,
  className,
}: RouteDiagramProps) {
  if (steps.length === 0) {
    return null;
  }
  const firstStep = steps[0];
  if (!firstStep) {
    return null;
  }

  const totalFeePct = (totalFeeBps / 100).toFixed(2);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-y-1">
        <AssetPill symbol={firstStep.fromAsset} />
        {steps.map((step, idx) => (
          <span
            className="inline-flex items-center"
            // biome-ignore lint/suspicious/noArrayIndexKey: route steps are positionally stable
            key={`${step.pool}-${idx}`}
          >
            <StepArrow fee={step.fee} pool={step.pool} />
            <AssetPill symbol={step.toAsset} />
          </span>
        ))}
      </div>
      <div className="flex justify-end">
        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em]">
          Total route fee · {totalFeePct}%
        </span>
      </div>
    </div>
  );
}
