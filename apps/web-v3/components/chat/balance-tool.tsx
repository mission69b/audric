"use client";

/**
 * Deterministic renderer for the `balance_check` tool result (Audric v3). The
 * tool returns the SDK's priced `BalanceResponse`; we render it straight to a
 * table — every holding as a row, Total = the SDK's `totalUsd`, "available to
 * spend" = the SDK's `available` (spendable stables). No agent math, so the
 * rows can never disagree with the total (the bug the free-text/sheet path had).
 */

import type { ChatMessage } from "@/lib/types";

type BalancePart = Extract<
  ChatMessage["parts"][number],
  { type: "tool-balance_check" }
>;

const fmtAmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmtUsd = (n: number) =>
  `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function BalanceTool({ part }: { part: BalancePart }) {
  if (part.state === "output-error") {
    return (
      <div className="text-[13px] text-amber-600">
        Couldn't read your balance just now — try again in a moment.
      </div>
    );
  }
  if (part.state !== "output-available") {
    return (
      <div className="text-[13px] text-muted-foreground">
        Checking your balance…
      </div>
    );
  }

  const out = part.output;
  const rows: {
    symbol: string;
    amount: number;
    usd: number | null;
    tag?: "spendable" | "gas";
  }[] = [
    ...Object.entries(out.stables).map(([symbol, amount]) => ({
      symbol,
      amount,
      usd: amount,
      tag: "spendable" as const,
    })),
    ...(out.sui.amount > 0
      ? [
          {
            symbol: "SUI",
            amount: out.sui.amount,
            usd: out.sui.usdValue,
            tag: "gas" as const,
          },
        ]
      : []),
    ...out.tokens.map((t) => ({
      symbol: t.symbol,
      amount: t.amount,
      usd: t.usdValue,
    })),
  ];

  return (
    <div className="w-[min(100%,460px)] overflow-hidden rounded-xl border border-border/60">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-border/60 border-b bg-muted/40 text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-medium">Asset</th>
            <th className="px-3 py-2 font-medium">Balance</th>
            <th className="px-3 py-2 text-right font-medium">USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              className="border-border/40 border-b last:border-0"
              key={r.symbol}
            >
              <td className="px-3 py-2">
                <span className="font-medium">{r.symbol}</span>
                {r.tag === "spendable" && (
                  <span className="ml-1.5 rounded bg-teal-500/10 px-1 py-0.5 text-[9px] text-teal-600 uppercase tracking-wide dark:text-teal-400">
                    spendable
                  </span>
                )}
                {r.tag === "gas" && (
                  <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground uppercase tracking-wide">
                    gas
                  </span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums">{fmtAmt(r.amount)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.usd == null ? "—" : fmtUsd(r.usd)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-border/60 border-t bg-muted/30 font-medium">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right tabular-nums">
              {fmtUsd(out.totalUsd)}
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="border-border/60 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {fmtUsd(out.available)}
        </span>{" "}
        available to spend · USDC + USDsui, gasless
        {out.tokens.length > 0 && " · other tokens above aren't priced"}
      </div>
    </div>
  );
}
