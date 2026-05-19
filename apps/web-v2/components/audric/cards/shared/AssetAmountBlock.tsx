"use client";

import { cn } from "@/lib/utils";
import { fmtAmt, fmtUsd } from "../primitives";

/**
 * AssetAmountBlock — shared primitive used by 12 engine tools.
 * Ported from `apps/web/components/engine/cards/shared/AssetAmountBlock.tsx`
 * by Phase 5a.1 (renderer migration sweep, 2026-05-19). Verbatim except
 * `cn` import path (`@/lib/cn` → `@/lib/utils`) and the `<img>` lint
 * disable (web-v2's biome config doesn't flag it).
 */
interface AssetAmountBlockProps {
  amount: number;
  asset: string;
  className?: string;
  label?: string;
  logo?: string;
  suffix?: string;
  usdValue: number | null;
}

export function AssetAmountBlock({
  asset,
  amount,
  usdValue,
  logo,
  label,
  suffix,
  className,
}: AssetAmountBlockProps) {
  const usdText = usdValue == null ? "—" : `$${fmtUsd(usdValue)}`;

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {label && (
        <span className="font-mono text-[9px] text-fg-muted uppercase tracking-[0.12em]">
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-2">
        {logo && (
          // biome-ignore lint/performance/noImgElement: token logos are external URLs that pre-date Next/Image migration.
          <img
            alt=""
            className="h-4 w-4 shrink-0 self-center rounded-full"
            src={logo}
          />
        )}
        <span className="font-medium text-fg-primary text-sm">
          {fmtAmt(amount)}
          <span className="ml-1 font-mono text-fg-muted text-xs uppercase tracking-wider">
            {asset}
          </span>
        </span>
        <span className="ml-auto text-fg-muted text-xs">
          {usdText}
          {suffix && (
            <span className="ml-1 font-mono text-[10px] text-fg-muted">
              {suffix}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
