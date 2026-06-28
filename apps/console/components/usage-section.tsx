"use client";

import { useCallback, useEffect, useState } from "react";

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

// Spend display: 2dp at/above $0.01, 4dp for sub-cent usage (so a handful of
// tokens isn't misleadingly "$0.00"). Floored — never overstate actual spend.
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
    <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-end">
        <div className="flex gap-1">
          {(["24h", "30d"] as Window[]).map((w) => (
            <button
              className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
                window === w
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
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
        <p className="mt-3 text-[var(--muted)] text-sm">
          No API usage in this window yet. Make a call with your key to see it
          here.
        </p>
      ) : null}

      {rows && rows.length > 0 ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[var(--dim)] text-[11px] uppercase">
                Spend
              </div>
              <div className="font-semibold text-[var(--foreground)] text-xl">
                {fmtSpend(totalSpend)}
              </div>
            </div>
            <div>
              <div className="text-[var(--dim)] text-[11px] uppercase">
                Requests
              </div>
              <div className="font-semibold text-[var(--foreground)] text-xl">
                {totalReq}
              </div>
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-[var(--dim)] text-[11px] uppercase">
                <th className="pb-2 text-left font-medium">Model</th>
                <th className="pb-2 text-right font-medium">Reqs</th>
                <th className="pb-2 text-right font-medium">Tokens</th>
                <th className="pb-2 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  className="border-[var(--border-bright)] border-t"
                  key={r.model}
                >
                  <td className="py-2 font-mono text-[12px] text-[var(--foreground)]">
                    {r.model}
                  </td>
                  <td className="py-2 text-right text-[var(--muted)]">
                    {r.requests}
                  </td>
                  <td className="py-2 text-right text-[var(--muted)]">
                    {fmtTokens(r.inputTokens + r.outputTokens)}
                  </td>
                  <td className="py-2 text-right text-[var(--muted)]">
                    {fmtSpend(r.costMicros)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
