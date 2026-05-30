"use client";

import { useMemo, useState } from "react";
import { fmtUsd } from "../primitives";
import {
  CanvasButton,
  CanvasFooterMeta,
  CanvasShell,
} from "./canvas-shell";

interface HealthSimulatorData {
  available: true;
  initialCollateral: number;
  initialDebt: number;
  currentHf: number | null;
}

interface Props {
  data: HealthSimulatorData;
  onAction?: (text: string) => void;
}

type HfStatus = "safe" | "warn" | "danger";

function calcHF(collateral: number, debt: number): number | null {
  if (debt <= 0) {
    return null;
  }
  return (collateral * 0.8) / debt;
}

// phase2 C2 thresholds: safe ≥ 2, watch 1.3–2, at-risk < 1.3.
function hfStatus(hf: number | null): HfStatus {
  if (hf === null || hf >= 2) {
    return "safe";
  }
  if (hf >= 1.3) {
    return "warn";
  }
  return "danger";
}

const STATUS_TEXT: Record<HfStatus, string> = {
  safe: "text-success",
  warn: "text-warning",
  danger: "text-destructive",
};

const STATUS_ACCENT: Record<HfStatus, string> = {
  safe: "accent-success",
  warn: "accent-warning",
  danger: "accent-destructive",
};

const STATUS_ZONE: Record<HfStatus, string> = {
  safe: "Safe · HF > 2",
  warn: "Watch · HF 1.3–2",
  danger: "At risk · HF < 1.3",
};

const CIRC = 2 * Math.PI * 40;

export function HealthSimulatorCanvas({ data, onAction }: Props) {
  const [collateral, setCollateral] = useState(data.initialCollateral);
  const [debt, setDebt] = useState(data.initialDebt);

  const hf = useMemo(() => calcHF(collateral, debt), [collateral, debt]);
  const status = hfStatus(hf);
  const dirty =
    collateral !== data.initialCollateral || debt !== data.initialDebt;

  const ltv = collateral > 0 ? (debt / collateral) * 100 : 0;
  const liqCollateral = debt > 0 ? debt / 0.8 : null;
  const collateralDelta = collateral - data.initialCollateral;

  const safeRepay = useMemo(() => {
    if (debt <= 0) {
      return 0;
    }
    const targetDebt = (collateral * 0.8) / 3.0;
    return Math.max(0, debt - targetDebt);
  }, [collateral, debt]);

  // ── No-position state ──────────────────────────────────────────
  if (data.initialDebt <= 0 && debt <= 0) {
    return (
      <CanvasShell
        eyebrow="NAVI · Health monitor"
        name="No borrow position"
        summary={{ value: "∞", label: "Current HF" }}
      >
        <div className="px-2 py-6 text-center">
          <p className="mx-auto max-w-sm text-[14px] text-muted-foreground leading-[1.55] tracking-[-0.011em]">
            You haven't borrowed anything. Health factor is only meaningful
            with an open debt position.
          </p>
          {onAction && (
            <div className="mt-5 flex justify-center gap-2">
              <CanvasButton
                onClick={() => onAction("Explain how borrowing works on NAVI")}
                variant="secondary"
              >
                Learn about borrowing
              </CanvasButton>
              <CanvasButton
                onClick={() => onAction("Borrow USDC against my savings")}
                variant="primary"
              >
                Borrow against collateral
              </CanvasButton>
            </div>
          )}
        </div>
      </CanvasShell>
    );
  }

  const hfFraction = hf == null ? 1 : Math.max(0.04, Math.min(0.96, hf / 3.5));
  const dashoffset = CIRC * (1 - hfFraction);

  const name = dirty
    ? `Simulating · HF ${hf?.toFixed(2) ?? "∞"}`
    : status === "danger"
      ? "At risk · HF below safe threshold"
      : status === "warn"
        ? "Margin is tight"
        : "Your borrow position is safe";

  const banner =
    status === "danger"
      ? {
          tone: "danger" as const,
          icon: "✕",
          text: "Audric's safety guard will block a withdrawal this aggressive. Repay debt or add collateral first.",
        }
      : status === "warn"
        ? {
            tone: "warn" as const,
            icon: "!",
            text: `Margin tightens. Consider repaying${safeRepay > 1 ? ` $${fmtUsd(safeRepay)}` : ""} to stay above HF 2.`,
          }
        : null;

  return (
    <CanvasShell
      eyebrow="NAVI · Health monitor"
      footer={
        <>
          <CanvasFooterMeta>
            {status === "danger"
              ? "Apply disabled · HF must stay above 1.30"
              : "Drag sliders to preview repaying or adjusting collateral."}
          </CanvasFooterMeta>
          {dirty && (
            <CanvasButton
              onClick={() => {
                setCollateral(data.initialCollateral);
                setDebt(data.initialDebt);
              }}
              variant="secondary"
            >
              Reset
            </CanvasButton>
          )}
          {onAction && safeRepay > 1 && (
            <CanvasButton
              onClick={() => onAction(`Repay $${Math.ceil(safeRepay)} USDC debt`)}
              variant="primary"
            >
              Repay ${Math.ceil(safeRepay).toLocaleString()} →
            </CanvasButton>
          )}
        </>
      }
      live={!dirty}
      name={name}
      summary={{
        value: <span className={STATUS_TEXT[status]}>{hf?.toFixed(2) ?? "∞"}</span>,
        label: dirty ? "Simulated HF" : "Current HF",
      }}
    >
      <div className="flex flex-col items-center gap-7 sm:grid sm:grid-cols-[200px_1fr] sm:items-center">
        <div className="flex flex-col items-center">
          <div className="relative h-[180px] w-[180px]">
            <svg className="-rotate-90 h-full w-full" viewBox="0 0 100 100">
              <circle
                className="text-muted"
                cx="50"
                cy="50"
                fill="none"
                r="40"
                stroke="currentColor"
                strokeWidth="9"
              />
              <circle
                className={STATUS_TEXT[status]}
                cx="50"
                cy="50"
                fill="none"
                r="40"
                stroke="currentColor"
                strokeDasharray={CIRC}
                strokeDashoffset={dashoffset}
                strokeLinecap="round"
                strokeWidth="9"
                style={{ transition: "stroke-dashoffset 250ms ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`font-medium font-mono text-[40px] leading-none tracking-[-0.04em] tabular-nums ${status === "danger" ? "text-destructive" : "text-foreground"}`}
              >
                {hf?.toFixed(2) ?? "∞"}
              </span>
              <span className="mt-1 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
                {dirty ? "Simulated" : "Health factor"}
              </span>
            </div>
          </div>
          <div
            className={`mt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] ${STATUS_TEXT[status]}`}
          >
            {STATUS_ZONE[status]}
          </div>
        </div>

        <div className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-3.5">
          <PosLabel>Collateral</PosLabel>
          <PosValue tone={collateralDelta < 0 ? status : "default"}>
            ${fmtUsd(collateral)}
            {collateralDelta !== 0 && (
              <span
                className={`ml-1.5 font-mono text-[11px] ${collateralDelta < 0 ? "text-destructive" : "text-success"}`}
              >
                {collateralDelta < 0 ? "−" : "+"}${fmtUsd(Math.abs(collateralDelta))}
              </span>
            )}
          </PosValue>

          <PosLabel>Borrowed</PosLabel>
          <PosValue>${fmtUsd(debt)}</PosValue>

          <PosLabel>LTV ratio</PosLabel>
          <PosValue tone={ltv > 60 ? status : "default"}>
            {ltv.toFixed(0)}%
          </PosValue>

          <div className="col-span-2 h-px bg-border" />

          <PosLabel>Liquidation at</PosLabel>
          <PosValue tone={status === "danger" ? "danger" : "default"}>
            {liqCollateral != null
              ? `$${fmtUsd(liqCollateral)} collateral`
              : "—"}
          </PosValue>
        </div>
      </div>

      {banner && (
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-[1.5] tracking-[-0.011em] ${
            banner.tone === "danger"
              ? "border-destructive/30 bg-destructive/[0.06] text-destructive"
              : "border-warning/30 bg-warning/[0.06] text-warning"
          }`}
        >
          <span className="shrink-0 font-mono font-semibold">{banner.icon}</span>
          <span>{banner.text}</span>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4 border-border border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
            Simulate position changes
          </span>
          <span
            className={`font-mono text-[10.5px] tracking-[0.04em] ${dirty ? STATUS_TEXT[status] : "text-muted-foreground"}`}
          >
            {dirty
              ? status === "danger"
                ? "Blocked by safety guard"
                : "Unsaved changes"
              : "No changes"}
          </span>
        </div>

        <SliderRow
          accent={STATUS_ACCENT[status]}
          label="Collateral"
          max={Math.max(3000, data.initialCollateral * 1.5)}
          min={0}
          onChange={setCollateral}
          readout={`$${collateral.toLocaleString()}`}
          step={50}
          value={collateral}
        />
        <SliderRow
          accent="accent-foreground"
          label="Borrowed"
          max={Math.max(1800, collateral * 0.75, debt)}
          min={0}
          onChange={setDebt}
          readout={`$${debt.toLocaleString()}`}
          step={50}
          value={debt}
        />
      </div>
    </CanvasShell>
  );
}

function PosLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="self-center font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
      {children}
    </span>
  );
}

function PosValue({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: HfStatus | "default";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-warning"
        : tone === "safe"
          ? "text-success"
          : "text-foreground";
  return (
    <span
      className={`text-right font-medium font-mono text-[16px] tracking-[-0.014em] tabular-nums ${toneClass}`}
    >
      {children}
    </span>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  accent,
  readout,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent: string;
  readout: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr_96px] items-center gap-4">
      <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </span>
      <input
        className={`h-1.5 w-full cursor-pointer ${accent}`}
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="text-right font-medium font-mono text-[13px] text-foreground tabular-nums">
        {readout}
      </span>
    </div>
  );
}
