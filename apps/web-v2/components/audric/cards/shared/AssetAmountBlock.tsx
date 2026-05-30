"use client";

import { cn } from "@/lib/utils";
import { fmtAmt, fmtUsd } from "../primitives";

/**
 * AssetAmountBlock — token icon / amount / symbol / USD aside.
 *
 * [R6.4 / A1 — 2026-05-30] Aligned to the phase2 spec
 * (`t2000-AFI/audric/phase2-tool-blocks.html` §2 `.asset`), option B
 * (compact one-line): a 32px circular token icon (the asset's first
 * letter, or a passed `logo`), the amount in Departure **mono**, the
 * symbol in Geist **sans**, and the USD value as a mono aside.
 *
 * Font fix: pre-R6.4 the amount rendered in sans and the symbol in mono
 * (swapped vs spec) — that mismatch is corrected here. `tone="warning"`
 * tints the icon + amount amber for borrowed/negative amounts.
 *
 * Props preserved for the ~12 existing consumers (asset / amount /
 * usdValue / logo / label / suffix); `tone` is additive + optional.
 */
interface AssetAmountBlockProps {
  amount: number;
  asset: string;
  className?: string;
  label?: string;
  logo?: string;
  suffix?: string;
  tone?: "default" | "warning";
  usdValue: number | null;
}

export function AssetAmountBlock({
  asset,
  amount,
  usdValue,
  logo,
  label,
  suffix,
  tone = "default",
  className,
}: AssetAmountBlockProps) {
  const usdText = usdValue == null ? "—" : `$${fmtUsd(usdValue)}`;
  const isWarning = tone === "warning";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em]">
          {label}
        </span>
      )}
      <div className="flex items-center gap-3">
        {logo ? (
          // biome-ignore lint/performance/noImgElement: token logos are external URLs that pre-date Next/Image migration.
          <img
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border border-border"
            src={logo}
          />
        ) : (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-semibold text-xs",
              isWarning
                ? "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-warning"
                : "border-border bg-muted text-foreground"
            )}
          >
            {asset.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-medium font-mono text-[18px] tabular-nums tracking-[-0.018em]",
              isWarning ? "text-warning" : "text-foreground"
            )}
          >
            {fmtAmt(amount)}
          </span>
          <span className="font-medium text-muted-foreground text-sm tracking-[-0.011em]">
            {asset}
          </span>
        </span>
        <span
          className={cn(
            "ml-auto font-mono text-[11.5px] tabular-nums tracking-[0.02em]",
            isWarning ? "text-warning" : "text-muted-foreground"
          )}
        >
          {usdText}
          {suffix && <span className="ml-1 text-muted-foreground">· {suffix}</span>}
        </span>
      </div>
    </div>
  );
}
