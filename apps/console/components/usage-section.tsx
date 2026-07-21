"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@/components/section";
import { cn } from "@/lib/utils";

type UsageRow = {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

type Window = "24h" | "30d";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

function fmtSpend(micros: number): string {
  if (micros <= 0) {
    return "$0.00";
  }
  if (micros >= 10_000) {
    return `$${(Math.floor(micros / 10_000) / 100).toFixed(2)}`;
  }
  return `$${(Math.floor(micros / 100) / 10_000).toFixed(4)}`;
}

export function UsageSection() {
  const [window, setWindow] = useState<Window>("30d");
  const [rows, setRows] = useState<UsageRow[] | null>(null);

  const load = useCallback(async (w: Window) => {
    try {
      const res = await fetch(`/api/usage?window=${w}`);
      if (res.ok) {
        const j = (await res.json()) as { rows: UsageRow[] };
        setRows(j.rows);
      }
    } catch {
      // transient
    }
  }, []);

  useEffect(() => {
    load(window);
  }, [load, window]);

  const totalSpend = (rows ?? []).reduce((s, r) => s + r.costMicros, 0);
  const totalReq = (rows ?? []).reduce((s, r) => s + r.requests, 0);

  return (
    <Section>
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="text-muted-foreground text-xs">Spend</div>
            <div className="font-semibold text-foreground text-xl tabular-nums">
              {fmtSpend(totalSpend)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Requests</div>
            <div className="font-semibold text-foreground text-xl tabular-nums">
              {totalReq}
            </div>
          </div>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {(["24h", "30d"] as Window[]).map((w) => (
            <button
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                window === w
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={w}
              onClick={() => setWindow(w)}
              type="button"
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {rows && rows.length === 0 ? (
        <p className="mt-4 text-muted-foreground text-xs">
          No API usage in this window yet. Make a call with your key to see it
          here.
        </p>
      ) : null}

      {rows && rows.length > 0 ? (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="pb-2 font-medium">Model</th>
              <th className="pb-2 pl-3 text-right font-medium">Reqs</th>
              {/* Tokens is the first column to give up at phone widths —
                  Reqs + Spend carry the story. */}
              <th className="pb-2 pl-3 text-right font-medium max-sm:hidden">
                Tokens
              </th>
              <th className="pb-2 pl-3 text-right font-medium">Spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                className="border-border/50 border-b last:border-0"
                key={r.model}
              >
                <td className="break-all py-2.5 font-mono text-foreground text-xs">
                  {r.model}
                </td>
                <td className="py-2.5 pl-3 text-right text-muted-foreground tabular-nums">
                  {r.requests}
                </td>
                <td className="py-2.5 pl-3 text-right text-muted-foreground tabular-nums max-sm:hidden">
                  {fmtTokens(r.inputTokens + r.outputTokens)}
                </td>
                <td className="py-2.5 pl-3 text-right text-muted-foreground tabular-nums">
                  {fmtSpend(r.costMicros)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Section>
  );
}
