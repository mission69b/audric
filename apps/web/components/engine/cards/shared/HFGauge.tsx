'use client';

import { Gauge } from '../primitives';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// Day 7 — HFGauge (TOOL_UX_DESIGN_v07a.md, B+ plan)
//
// Shared render primitive used by 3 engine tools (post-Day-10 migration):
//   health_check (current HF, no projection),
//   borrow (current → projected HF after the borrow lands),
//   withdraw (current → projected HF after the withdraw lands; only when
//             user has open borrows).
//
// Wraps the existing generic `Gauge` primitive with HF-specific defaults:
//   - hard min/max (0 / 5) so the visual scale is consistent across tools
//   - liquidation marker pinned at 1.0 (red threshold line)
//   - colour mode = `health_factor` (existing palette: <1.1 red, <1.5
//     warning, <2.0 warning, ≥2.0 success)
//   - projection row: shows the post-action HF below the gauge with a
//     ↑ / ↓ arrow + a one-line label. Borrow + withdraw flows pass this
//     to surface "you'll be at 1.42 — borderline" *before* the user taps.
//
// The current HF is the GAUGE FILL; the projection (when present) is a
// separate label row, not a second fill, so the user can compare the
// before/after numbers at a glance without the gauge confusingly
// animating from one fill to another.
// ───────────────────────────────────────────────────────────────────────────

interface HFProjection {
  /** The HF the user will land on after the action executes. */
  healthFactor: number;
  /** Short human label, e.g. "after borrow" or "after withdraw". */
  label: string;
}

interface HFGaugeProps {
  /** Current health factor — the gauge fill. */
  healthFactor: number;
  /** Liquidation threshold marker. NAVI = 1.0; pass explicitly for parity
   *  with the lending market the user is in (kept as a prop so future
   *  protocols with different thresholds slot in cleanly). */
  liquidationThreshold: number;
  /** Optional post-action projection row. */
  projection?: HFProjection;
  /** Optional className extension. */
  className?: string;
}

function formatHF(hf: number): string {
  // [v2.0.4 / 2026-05-17] Threshold raised from 99 → 9999 for consistency
  // with the same primitive in `preview-bodies/index.tsx` and the
  // "no debt · safe" sentinel in `timeline/result-preview.ts`. See the
  // formatHF comment in preview-bodies for the broader root-cause note.
  if (!Number.isFinite(hf) || hf >= 9999) return '∞';
  return hf.toFixed(2);
}

function projectionDirection(current: number, projected: number): '↑' | '↓' | '·' {
  if (projected > current + 0.001) return '↑';
  if (projected < current - 0.001) return '↓';
  return '·';
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
  const projectionColor =
    projection == null
      ? ''
      : projection.healthFactor < 1.1
        ? 'text-error-solid'
        : projection.healthFactor < 1.5
          ? 'text-warning-solid'
          : 'text-success-solid';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-fg-muted">
          Health factor
        </span>
        <span className="text-fg-primary text-base font-medium tabular-nums">
          {formatHF(healthFactor)}
        </span>
      </div>
      <Gauge
        value={healthFactor}
        min={0}
        max={5}
        thresholds={[{ value: liquidationThreshold, label: 'Liquidation' }]}
        colorMode="health_factor"
      />
      {projection && (
        <div className="flex items-baseline justify-between text-xs pt-1 border-t border-border-subtle">
          <span className="text-fg-muted">{projection.label}</span>
          <span className={cn('font-mono tabular-nums', projectionColor)}>
            {arrow} {formatHF(projection.healthFactor)}
          </span>
        </div>
      )}
    </div>
  );
}
