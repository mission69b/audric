"use client";

import { useMemo, useState } from "react";
import { fmtUsd, Gauge } from "../primitives";

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

function calcHF(collateral: number, debt: number): number | null {
  if (debt <= 0) {
    return null;
  }
  return (collateral * 0.8) / debt;
}

function hfStatus(hf: number | null): "healthy" | "warning" | "danger" {
  if (hf === null) {
    return "healthy";
  }
  if (hf < 1.1) {
    return "danger";
  }
  if (hf < 1.5) {
    return "warning";
  }
  return "healthy";
}

function liquidationPrice(collateral: number, debt: number): number | null {
  if (debt <= 0 || collateral <= 0) {
    return null;
  }
  return debt / 0.8;
}

export function HealthSimulatorCanvas({ data, onAction }: Props) {
  const [collateral, setCollateral] = useState(data.initialCollateral);
  const [debt, setDebt] = useState(data.initialDebt);

  const hf = useMemo(() => calcHF(collateral, debt), [collateral, debt]);
  const status = hfStatus(hf);
  const liqCollateral = liquidationPrice(collateral, debt);

  const drop20hf = useMemo(
    () => calcHF(collateral * 0.8, debt),
    [collateral, debt]
  );
  const drop40hf = useMemo(
    () => calcHF(collateral * 0.6, debt),
    [collateral, debt]
  );

  const safeRepay = useMemo(() => {
    if (debt <= 0) {
      return 0;
    }
    const targetDebt = (collateral * 0.8) / 3.0;
    return Math.max(0, debt - targetDebt);
  }, [collateral, debt]);

  const statusLabel: Record<typeof status, string> = {
    healthy: "Healthy",
    warning: "At Risk",
    danger: "Danger",
  };
  const statusColor: Record<typeof status, string> = {
    healthy: "text-success-solid",
    warning: "text-warning-solid",
    danger: "text-error-solid",
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] text-fg-muted uppercase tracking-wider">
            Collateral
          </label>
          <span className="font-mono text-fg-primary text-sm">
            ${collateral.toLocaleString()} USDC
          </span>
        </div>
        <input
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-foreground"
          max={50_000}
          min={100}
          onChange={(e) => setCollateral(Number(e.target.value))}
          step={100}
          type="range"
          value={collateral}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] text-fg-muted uppercase tracking-wider">
            Debt
          </label>
          <span className="font-mono text-fg-primary text-sm">
            ${debt.toLocaleString()} USDC
          </span>
        </div>
        <input
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-foreground"
          max={Math.min(collateral * 0.75, 40_000)}
          min={0}
          onChange={(e) => setDebt(Number(e.target.value))}
          step={50}
          type="range"
          value={Math.min(debt, collateral * 0.75)}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-page p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-fg-muted uppercase tracking-wider">
            Health Factor
          </span>
          <span
            className={`font-medium font-mono text-sm ${
              hf !== null ? statusColor[status] : "text-fg-muted"
            }`}
          >
            {hf !== null ? hf.toFixed(2) : "∞"}
            {hf !== null && (
              <span className={`ml-2 text-[10px] ${statusColor[status]}`}>
                ● {statusLabel[status]}
              </span>
            )}
          </span>
        </div>
        {hf !== null && (
          <Gauge colorMode="health_factor" max={5} min={0} value={hf} />
        )}
      </div>

      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-fg-muted">Price drops 20%</span>
          <span
            className={
              drop20hf !== null && drop20hf < 1.5
                ? "text-warning-solid"
                : "text-fg-primary"
            }
          >
            HF → {drop20hf !== null ? drop20hf.toFixed(2) : "∞"}
            {drop20hf !== null && drop20hf < 1.5 ? " ⚠" : ""}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Price drops 40%</span>
          <span
            className={
              drop40hf !== null && drop40hf < 1.5
                ? "text-error-solid"
                : "text-fg-primary"
            }
          >
            HF → {drop40hf !== null ? drop40hf.toFixed(2) : "∞"}
            {drop40hf !== null && drop40hf < 1.1
              ? " ✕ Liquidation risk"
              : drop40hf !== null && drop40hf < 1.5
                ? " ⚠"
                : ""}
          </span>
        </div>
        {liqCollateral !== null && debt > 0 && (
          <div className="flex justify-between">
            <span className="text-fg-muted">Liquidation at</span>
            <span className="text-fg-primary">
              ${fmtUsd(liqCollateral)} collateral
            </span>
          </div>
        )}
        {safeRepay > 1 && (
          <div className="flex justify-between border-border-subtle/50 border-t pt-0.5">
            <span className="text-fg-muted">Repay for HF 3.0</span>
            <span className="text-success-solid">${fmtUsd(safeRepay)}</span>
          </div>
        )}
      </div>

      {onAction && safeRepay > 1 && (
        <button
          className="w-full rounded-md bg-fg-primary py-2 font-mono text-[10px] text-fg-inverse uppercase tracking-wider transition hover:opacity-90"
          onClick={() =>
            onAction(`Repay $${Math.ceil(safeRepay)} USDC debt`)
          }
          type="button"
        >
          Repay ${Math.ceil(safeRepay).toLocaleString()} now →
        </button>
      )}
    </div>
  );
}
