"use client";

import { cn } from "@/lib/utils";

/**
 * AddressBlock — avatar / handle / short-addr (+ optional tag).
 *
 * [R6.4 / A1 — 2026-05-30] Built to the phase2 spec
 * (`t2000-AFI/audric/phase2-tool-blocks.html` §3 `.addr`): a 28px
 * gradient avatar, a sans handle, a mono short address, and an optional
 * tag — cyan "Verified" (the one sanctioned `--signal` use, per
 * AUDRIC-HANDOFF §1) or muted "Raw" for an unresolved 0x.
 */
type AddressTag = "verified" | "raw";

interface AddressBlockProps {
  /** Already-truncated short form, e.g. `0xa4b2…c019`. */
  address: string;
  className?: string;
  /** SuiNS handle / display name. Omit for a raw, unresolved address. */
  handle?: string;
  resolving?: boolean;
  tag?: AddressTag;
}

export function AddressBlock({
  handle,
  address,
  tag,
  resolving,
  className,
}: AddressBlockProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className="h-7 w-7 shrink-0 rounded-full border border-border"
        style={{
          background: resolving
            ? "var(--muted)"
            : "linear-gradient(135deg, var(--muted-foreground), var(--foreground))",
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        {resolving ? (
          <span className="font-medium text-muted-foreground text-sm tracking-[-0.011em]">
            Resolving…
          </span>
        ) : (
          <span
            className={cn(
              "font-medium text-foreground tracking-[-0.011em]",
              handle ? "text-sm" : "font-mono text-[13px]"
            )}
          >
            {handle ?? address}
          </span>
        )}
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
          {handle ? address : "no SUINS handle"}
        </span>
      </div>
      {tag && (
        <span
          className={cn(
            "rounded-[3px] border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em]",
            tag === "verified"
              ? "border-[color-mix(in_srgb,var(--signal)_30%,transparent)] bg-[color-mix(in_srgb,var(--signal)_10%,transparent)] text-signal"
              : "border-border bg-muted text-muted-foreground"
          )}
        >
          {tag === "verified" ? "Verified" : "Raw"}
        </span>
      )}
    </div>
  );
}
