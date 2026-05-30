"use client";

import {
  createContext,
  type ReactNode,
  useContext,
} from "react";

/**
 * R6.4 — shared canvas chrome + presentational primitives.
 *
 * Implements the phase2 `.canvas` spec (see
 * `t2000-AFI/audric/phase2-canvases.html`): every canvas template renders
 * through `CanvasShell`, which owns the eyebrow + dot, the big name, the
 * optional right-aligned summary OR controls slot, the body, and an
 * optional footer. The live/data wiring stays inside each canvas — the
 * shell is presentational only.
 *
 * Expand affordance: `CanvasCard` wraps the template in
 * `CanvasChromeProvider` with an `onExpand` callback. `CanvasShell` reads
 * it from context and renders the expand button in the header — so no
 * canvas signature needs an `onExpand` prop drilled through it. The
 * modal renders with `expanded` so the shell hides the button.
 */

interface CanvasChrome {
  onExpand?: () => void;
  expanded?: boolean;
}

const CanvasChromeContext = createContext<CanvasChrome>({});

export function CanvasChromeProvider({
  value,
  children,
}: {
  value: CanvasChrome;
  children: ReactNode;
}) {
  return (
    <CanvasChromeContext.Provider value={value}>
      {children}
    </CanvasChromeContext.Provider>
  );
}

interface CanvasShellProps {
  eyebrow: string;
  /** Cyan signal dot when the canvas reflects live data. */
  live?: boolean;
  name: ReactNode;
  /** Right-aligned mono summary (value + label). Ignored when `controls` set. */
  summary?: { value: ReactNode; label: string };
  /** Right-aligned controls slot (e.g. RangeTabs). Takes precedence over summary. */
  controls?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function CanvasShell({
  eyebrow,
  live,
  name,
  summary,
  controls,
  footer,
  children,
}: CanvasShellProps) {
  const { onExpand, expanded } = useContext(CanvasChromeContext);
  const showExpand = !!onExpand && !expanded;

  // Expanded (modal) renders its own chrome (title bar + close); the shell
  // contributes only its body so the analysis isn't double-framed.
  if (expanded) {
    return <>{children}</>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-border border-b px-[22px] py-4">
        <div className="min-w-0">
          <p className="mb-1 flex items-center font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            <span
              className={`mr-1.5 ml-1 inline-block h-1 w-1 rounded-full ${live ? "bg-signal" : "bg-muted-foreground"}`}
            />
            {eyebrow}
          </p>
          <h2 className="m-0 truncate font-medium text-[18px] text-foreground tracking-[-0.018em]">
            {name}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {controls ??
            (summary && (
              <div className="text-right font-mono">
                <div className="font-medium text-[18px] text-foreground tabular-nums tracking-[-0.014em]">
                  {summary.value}
                </div>
                <div className="mt-0.5 text-[9.5px] text-muted-foreground uppercase tracking-[0.08em]">
                  {summary.label}
                </div>
              </div>
            ))}
          {showExpand && (
            <button
              aria-label="Expand canvas to fullscreen"
              className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={onExpand}
              title="Expand to fullscreen"
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.4"
                viewBox="0 0 16 16"
                width="14"
              >
                <path d="M6 2H2V6M10 2H14V6M14 10V14H10M2 10V14H6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-[22px] py-[22px]">{children}</div>

      {footer && (
        <div className="flex items-center gap-3 border-border border-t bg-muted px-[22px] py-3.5">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Footer meta text (left side of a canvas footer). */
export function CanvasFooterMeta({ children }: { children: ReactNode }) {
  return (
    <span className="flex-1 font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
      {children}
    </span>
  );
}

const RANGE_BTN_BASE =
  "rounded px-2.5 py-1 font-mono text-[10.5px] tracking-[0.04em] transition";

export function RangeTabs({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-md border border-border bg-muted p-0.5">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            aria-pressed={active}
            className={`${RANGE_BTN_BASE} ${active ? "border border-border bg-background text-foreground" : "border border-transparent text-muted-foreground hover:text-foreground"}`}
            key={o}
            onClick={() => onChange(o)}
            type="button"
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

type MetricTone = "default" | "up" | "down";

const METRIC_TONE: Record<MetricTone, string> = {
  default: "text-foreground",
  up: "text-success",
  down: "text-destructive",
};

export function CanvasMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: MetricTone;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </div>
      <div
        className={`mt-1 font-medium font-mono text-[16px] tabular-nums tracking-[-0.018em] ${METRIC_TONE[tone]}`}
      >
        {value}
      </div>
    </div>
  );
}

export function CanvasMetricGrid({
  cols = 4,
  children,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const colClass =
    cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
  return <div className={`grid gap-[18px] ${colClass}`}>{children}</div>;
}

const ALLOC_FILL: Record<1 | 2 | 3, string> = {
  1: "bg-foreground",
  2: "bg-muted-foreground",
  3: "bg-muted-foreground/40",
};

export function AllocBar({
  name,
  pct,
  valueLabel,
  tier = 1,
}: {
  name: string;
  pct: number;
  valueLabel: string;
  tier?: 1 | 2 | 3;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr_auto] items-center gap-3">
      <span className="truncate font-medium text-[13px] tracking-[-0.011em]">
        {name}
      </span>
      <div className="h-2 overflow-hidden rounded-[4px] bg-muted">
        <div
          className={`h-full rounded-[4px] ${ALLOC_FILL[tier]}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="text-right font-mono text-[12px] text-muted-foreground tabular-nums">
        {valueLabel}
      </span>
    </div>
  );
}

const CANVAS_BTN_BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3.5 font-medium text-[12.5px] tracking-[-0.011em] transition";

export function CanvasButton({
  variant = "secondary",
  onClick,
  children,
}: {
  variant?: "primary" | "secondary";
  onClick?: () => void;
  children: ReactNode;
}) {
  const variantClass =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : "border border-border text-foreground hover:border-foreground/30 hover:bg-accent";
  return (
    <button
      className={`${CANVAS_BTN_BASE} ${variantClass}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
