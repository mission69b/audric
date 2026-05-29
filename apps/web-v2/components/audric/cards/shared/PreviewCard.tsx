"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CardShell } from "../primitives";
import { HFGauge } from "./HFGauge";

/**
 * PreviewCard — shared wrapper for the 4 HITL preview cards
 * (save_deposit / withdraw / borrow / repay_debt).
 *
 * Ported from `apps/web/components/engine/cards/shared/PreviewCard.tsx`
 * by Phase 5a.1 (renderer migration sweep, 2026-05-19). Migrated to Geist
 * DS tokens in R6.3 — the confirm button is the inverted primary
 * (`bg-foreground text-background`).
 */

export interface HFImpact {
  current: number;
  label: string;
  liquidationThreshold: number;
  projected: number;
}

export interface FeeBreakdown {
  label: string;
  usdValue?: number;
}

interface PreviewCardProps {
  body: ReactNode;
  busy?: boolean;
  className?: string;
  confirmLabel: string;
  feeBreakdown?: FeeBreakdown;
  healthFactorImpact?: HFImpact;
  heading: string;
  onCancel?: () => void;
  onConfirm?: () => void;
}

export function PreviewCard({
  heading,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  healthFactorImpact,
  feeBreakdown,
  className,
}: PreviewCardProps) {
  return (
    <div className={className}>
      <CardShell title={heading}>
        <div className="space-y-3">
          <div>{body}</div>

          {healthFactorImpact && (
            <div className="border-border border-t pt-2">
              <HFGauge
                healthFactor={healthFactorImpact.current}
                liquidationThreshold={healthFactorImpact.liquidationThreshold}
                projection={{
                  healthFactor: healthFactorImpact.projected,
                  label: healthFactorImpact.label,
                }}
              />
            </div>
          )}

          {feeBreakdown && (
            <div className="flex items-baseline justify-between border-border border-t pt-2 text-xs">
              <span className="text-muted-foreground">{feeBreakdown.label}</span>
              {feeBreakdown.usdValue != null && (
                <span className="font-mono text-muted-foreground tabular-nums">
                  ${feeBreakdown.usdValue.toFixed(2)}
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-border border-t pt-2">
            {onCancel && (
              <button
                className={cn(
                  "rounded-md border border-border px-3 py-1.5 text-muted-foreground text-xs",
                  "transition hover:bg-muted disabled:opacity-50",
                )}
                disabled={busy}
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
            )}
            {onConfirm && (
              <button
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium text-xs",
                  "bg-foreground text-background",
                  "transition hover:opacity-80 disabled:opacity-50",
                )}
                disabled={busy}
                onClick={onConfirm}
                type="button"
              >
                {busy ? "Confirming…" : confirmLabel}
              </button>
            )}
          </div>
        </div>
      </CardShell>
    </div>
  );
}
