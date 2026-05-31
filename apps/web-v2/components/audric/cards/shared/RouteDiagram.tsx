"use client";

import { cn } from "@/lib/utils";

/**
 * RouteDiagram — multi-hop swap route, rebuilt to the phase2 RouteBlock
 * spec (R6.3 residue, `phase2-tool-blocks.html` §5 `.route`).
 *
 * Renders the A → B → C pill chain: each asset is a mono pill with a
 * round `.ico` initial badge, joined by → arrows, and closed with a
 * single trailing `.route-via` tag that summarises the route (pool +
 * hop count + total fee). High-fee routes (> 1%) tint the via tag amber
 * as a soft warning — mirrors the prototype's high-impact variant.
 *
 * Consumed by `SwapQuoteCardV2` (and any future multi-leg swap render).
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

function RoutePill({ symbol }: { symbol: string }) {
  const initial = symbol.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 font-medium font-mono text-[11.5px] text-foreground tracking-[-0.011em]">
      <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-accent font-semibold text-[8px] text-foreground">
        {initial}
      </span>
      {symbol}
    </span>
  );
}

function Arrow() {
  return (
    <span
      aria-hidden="true"
      className="font-mono text-[12px] text-muted-foreground"
    >
      →
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

  const totalFeePct = totalFeeBps / 100;
  const hops = steps.length;
  // Distinct pools in route order (the via tag names the venue when it's
  // a single consistent pool, falls back to the hop count otherwise).
  const pools = Array.from(new Set(steps.map((s) => s.pool).filter(Boolean)));
  const venue = pools.length === 1 ? pools[0] : "CETUS";
  const viaParts = [
    venue,
    hops > 1 ? `${hops} HOPS` : null,
    `${totalFeePct.toFixed(2)}% FEE`,
  ].filter(Boolean);
  const highFee = totalFeePct > 1;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <RoutePill symbol={firstStep.fromAsset} />
      {steps.map((step, idx) => (
        <span
          className="inline-flex items-center gap-1.5"
          // biome-ignore lint/suspicious/noArrayIndexKey: route steps are positionally stable
          key={`${step.pool}-${idx}`}
        >
          <Arrow />
          <RoutePill symbol={step.toAsset} />
        </span>
      ))}
      <span
        className={cn(
          "ml-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em]",
          highFee
            ? "border-warning/40 text-warning"
            : "border-[var(--border-strong)] text-muted-foreground"
        )}
      >
        {viaParts.join(" · ")}
      </span>
    </div>
  );
}
