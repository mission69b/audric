"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AssetRow — compact list row (phase2 `.arow` in
 * `t2000-AFI/audric/phase2-read-cards.html`): a 24px circular token
 * icon, the asset name in Geist sans (+ optional mono sub-tag), a muted
 * mono amount, and an emphasized mono value, all on a dotted-separated
 * grid. This is the LIST variant — distinct from the larger 32px
 * `AssetAmountBlock` hero line. Used by the read cards' holdings /
 * allocation / position lists (Balance, Portfolio, Savings).
 *
 * `value` carries either a USD figure (wallet/portfolio) or an APY
 * string (rates / positions); `tone` colors it (warning = debt amber,
 * success = positive APY green). `dim` fades dust rows per spec.
 */
type RowTone = "default" | "warning" | "success";

interface AssetRowProps {
  amount?: ReactNode;
  className?: string;
  dim?: boolean;
  /** Optional small mono tag after the name, e.g. "deposited" / "borrow". */
  sub?: string;
  symbol: string;
  tone?: RowTone;
  value: ReactNode;
}

const VALUE_TONE: Record<RowTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
};

const ICON_TONE: Record<RowTone, string> = {
  default: "border-border bg-muted text-foreground",
  success: "border-border bg-muted text-foreground",
  warning:
    "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] text-warning",
};

export function AssetRow({
  symbol,
  sub,
  amount,
  value,
  tone = "default",
  dim,
  className,
}: AssetRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 border-border border-b border-dotted py-2 last:border-b-0",
        dim && "opacity-70",
        className
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border font-semibold text-[10px]",
          ICON_TONE[tone]
        )}
      >
        {symbol.charAt(0).toUpperCase()}
      </span>
      <span className="font-medium text-[14px] text-foreground tracking-[-0.011em]">
        {symbol}
        {sub && (
          <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
      <span className="text-right font-mono text-[13px] text-muted-foreground tabular-nums">
        {amount}
      </span>
      <span
        className={cn(
          "min-w-[72px] text-right font-medium font-mono text-[13px] tabular-nums",
          VALUE_TONE[tone]
        )}
      >
        {value}
      </span>
    </div>
  );
}
