'use client';

import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// Day 8 — RouteDiagram (TOOL_UX_DESIGN_v07a.md, B+ plan)
//
// Shared render primitive used by 2 engine tools (post-Day-10 migration):
//   swap_quote    (Cetus aggregator route preview, 1-3 hops typical),
//   harvest_rewards (per-reward swap leg in the compound preview).
//
// Visual shape: a horizontal arrow chain `[FROM] →pool · feebps→ [MID] → [TO]`,
// with a final summary chip showing total fee bps. Mid-asset chips are
// reused as the next-leg `from` so the visual reads as one continuous chain
// rather than N independent rows.
//
// Why not generative-UI per-tool? Multi-DEX route visualization is the
// SAME shape regardless of which tool is calling it (Cetus 2-hop in
// swap_quote == Cetus 2-hop in harvest_rewards), so a single primitive
// keeps both tools visually consistent. Per-tool customization (e.g.
// "BEST ROUTE" eyebrow) is the caller's job, not this component's.
//
// `pool` is the DEX/protocol label ("Cetus", "Aftermath", "Turbos") —
// rendered as a small uppercase chip on the arrow itself.
// `fee` is the per-leg fee string (e.g. "0.05%" or "30 bps") — rendered
// as a tiny grey trailer next to the pool chip.
// ───────────────────────────────────────────────────────────────────────────

interface RouteStep {
  pool: string;
  fromAsset: string;
  toAsset: string;
  /** Per-leg fee, formatted by the caller (e.g. "0.05%" or "30 bps"). */
  fee: string;
}

interface RouteDiagramProps {
  steps: RouteStep[];
  /** Total route fee in basis points, e.g. 35 → "0.35%". */
  totalFeeBps: number;
  /** Optional className extension. */
  className?: string;
}

function AssetPill({ symbol }: { symbol: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider text-fg-primary"
      style={{
        border: '0.5px solid var(--border-subtle)',
        background: 'var(--surface-sunken)',
      }}
    >
      {symbol}
    </span>
  );
}

function StepArrow({ pool, fee }: { pool: string; fee: string }) {
  return (
    <span className="inline-flex flex-col items-center mx-1">
      <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-fg-muted">
        {pool} · {fee}
      </span>
      <span className="text-fg-muted text-xs leading-none" aria-hidden="true">
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
  if (steps.length === 0) return null;

  const totalFeePct = (totalFeeBps / 100).toFixed(2);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center flex-wrap gap-y-1">
        <AssetPill symbol={steps[0]!.fromAsset} />
        {steps.map((step, idx) => (
          <span key={`${step.pool}-${idx}`} className="inline-flex items-center">
            <StepArrow pool={step.pool} fee={step.fee} />
            <AssetPill symbol={step.toAsset} />
          </span>
        ))}
      </div>
      <div className="flex justify-end">
        <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-fg-muted">
          Total route fee · {totalFeePct}%
        </span>
      </div>
    </div>
  );
}
