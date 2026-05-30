"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * StatusBlock — dot / label / sub-detail.
 *
 * [R6.4 / A1 — 2026-05-30] Built to the phase2 spec
 * (`t2000-AFI/audric/phase2-tool-blocks.html` §4 `.status`): an 8px
 * colored dot with a soft ring, a mono uppercase label, and an optional
 * mono sub-detail line indented under the label. No emoji — color +
 * label carry the state (per AUDRIC-HANDOFF §1).
 */
type StatusKind = "settled" | "pending" | "failed" | "queued";

interface StatusBlockProps {
  className?: string;
  detail?: ReactNode;
  kind: StatusKind;
  label: string;
  /** Lay the dot + label out inline only (no sub-detail row). */
  inline?: boolean;
}

const DOT: Record<StatusKind, string> = {
  failed:
    "bg-destructive shadow-[0_0_0_4px_color-mix(in_srgb,var(--destructive)_16%,transparent)]",
  pending:
    "bg-signal shadow-[0_0_0_4px_color-mix(in_srgb,var(--signal)_16%,transparent)] animate-pulse",
  queued:
    "bg-muted-foreground shadow-[0_0_0_4px_color-mix(in_srgb,var(--muted-foreground)_16%,transparent)]",
  settled:
    "bg-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--success)_16%,transparent)]",
};

const LABEL_TEXT: Record<StatusKind, string> = {
  failed: "text-destructive",
  pending: "text-foreground",
  queued: "text-muted-foreground",
  settled: "text-foreground",
};

const SUB_TEXT: Record<StatusKind, string> = {
  failed: "text-destructive",
  pending: "text-muted-foreground",
  queued: "text-muted-foreground",
  settled: "text-muted-foreground",
};

export function StatusBlock({
  kind,
  label,
  detail,
  inline,
  className,
}: StatusBlockProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[kind])} />
        <span
          className={cn(
            "font-medium font-mono text-[11px] uppercase tracking-[0.08em]",
            LABEL_TEXT[kind]
          )}
        >
          {label}
        </span>
        {inline && detail && (
          <span
            className={cn(
              "font-mono text-[11px] tracking-[0.02em]",
              SUB_TEXT[kind]
            )}
          >
            {detail}
          </span>
        )}
      </div>
      {!inline && detail && (
        <span
          className={cn(
            "ml-4 font-mono text-[11px] tracking-[0.02em]",
            SUB_TEXT[kind]
          )}
        >
          {detail}
        </span>
      )}
    </div>
  );
}
