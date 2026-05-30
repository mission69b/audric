"use client";

import { AddressBadge, fmtRelativeTime } from "./primitives";

// TransactionHistoryCard — `transaction_history` tool renderer.
// [R6.4 / A4 — 2026-05-30] Rebuilt to the dedicated phase2 spec
// (`phase2-transaction-history.html`): a framed history shell with a
// sans title + mono sub, dashed day separators, and per-row 30px tone
// icon / title+sub / amount+usd columns. Data shape + date grouping +
// outflow heuristic preserved from the prior `apps/web` port. Filter
// chips (interactive) are intentionally deferred — the renderer is a
// display-only chat surface.

function fmtTxAmount(n: number): string {
  if (n > 0 && n < 0.01) {
    return n.toFixed(4);
  }
  return n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

interface TxRecord {
  digest: string;
  action: string;
  label?: string;
  amount?: number;
  asset?: string;
  recipient?: string;
  direction?: "in" | "out";
  timestamp: string | number;
  gasCost?: number;
}

function toDate(ts: string | number): Date {
  if (typeof ts === "number") {
    return new Date(ts);
  }
  const n = Number(ts);
  if (!Number.isNaN(n) && n > 1e12) {
    return new Date(n);
  }
  return new Date(ts);
}

function toIso(ts: string | number): string {
  return toDate(ts).toISOString();
}

interface HistoryData {
  transactions: TxRecord[];
  count: number;
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

const ACTION_GLYPHS: Record<string, string> = {
  save: "↓",
  deposit: "↓",
  supply: "↓",
  withdraw: "↑",
  send: "→",
  transfer: "→",
  receive: "←",
  borrow: "↙",
  repay: "↑",
  swap: "↺",
  claim: "✦",
  pay: "⚡",
  payment_link: "⚡",
};

const FRIENDLY_LABELS: Record<string, string> = {
  payment_link: "Payment link",
  "on-chain": "On-chain",
  swap: "Swap",
  send: "Send",
  deposit: "Deposit",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  claim: "Claim",
  lending: "Lending",
  transaction: "On-chain",
};

type RowTone = "in" | "out" | "swap" | "save";

const ICON_TONE: Record<RowTone, string> = {
  in: "border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_6%,transparent)] text-success",
  out: "border-border bg-muted text-foreground",
  save: "border-[color-mix(in_srgb,var(--signal)_20%,transparent)] bg-[color-mix(in_srgb,var(--signal)_6%,transparent)] text-signal",
  swap: "border-border bg-muted text-foreground",
};

function getGlyph(label: string): string {
  const lower = label.toLowerCase();
  if (ACTION_GLYPHS[lower]) {
    return ACTION_GLYPHS[lower];
  }
  for (const [key, glyph] of Object.entries(ACTION_GLYPHS)) {
    if (lower.includes(key)) {
      return glyph;
    }
  }
  return "◆";
}

function getDisplayLabel(label: string): string {
  return FRIENDLY_LABELS[label.toLowerCase()] ?? label;
}

function legacyIsOutflow(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower.includes("send") ||
    lower.includes("pay") ||
    lower.includes("repay") ||
    lower === "deposit" ||
    lower === "supply" ||
    lower === "stake"
  );
}

function rowTone(label: string, direction?: "in" | "out"): RowTone {
  if (direction === "in") {
    return "in";
  }
  const l = label.toLowerCase();
  if (l.includes("receive")) {
    return "in";
  }
  if (l.includes("swap")) {
    return "swap";
  }
  if (l.includes("save") || l.includes("deposit") || l.includes("supply")) {
    return "save";
  }
  return "out";
}

function groupByDate(txs: TxRecord[]): Map<string, TxRecord[]> {
  const groups = new Map<string, TxRecord[]>();
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString();

  for (const tx of txs) {
    const date = toDate(tx.timestamp);
    const d = date.toDateString();
    const label =
      d === today
        ? "Today"
        : d === yesterday
          ? "Yesterday"
          : date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)?.push(tx);
  }
  return groups;
}

const VISIBLE_LIMIT = 10;

function HistoryRow({ tx }: { tx: TxRecord }) {
  const rawLabel = tx.label ?? tx.action;
  const display = getDisplayLabel(rawLabel);
  const tone = rowTone(rawLabel, tx.direction);
  const outflow =
    tx.direction === "out"
      ? true
      : tx.direction === "in"
        ? false
        : legacyIsOutflow(rawLabel);
  const isIn = tone === "in";

  return (
    <div className="grid grid-cols-[30px_1fr_auto] items-center gap-3.5 border-border border-t border-dotted px-5 py-3 first:border-t-0">
      <span
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border text-[13px] ${ICON_TONE[tone]}`}
      >
        {getGlyph(rawLabel)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium text-[14px] text-foreground tracking-[-0.011em]">
          <span className="truncate">{display}</span>
          {tx.recipient && (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              →{" "}
              {tx.recipient.length > 12
                ? `${tx.recipient.slice(0, 6)}…${tx.recipient.slice(-4)}`
                : tx.recipient}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
          {fmtRelativeTime(toIso(tx.timestamp))}
        </div>
      </div>
      <div className="flex flex-col items-end gap-px text-right">
        {tx.amount != null && tx.amount > 0 && (
          <span
            className={`font-medium font-mono text-[14px] tabular-nums tracking-[-0.011em] ${isIn ? "text-success" : "text-foreground"}`}
          >
            {outflow ? "−" : "+"}
            {fmtTxAmount(tx.amount)} {tx.asset ?? "USDC"}
          </span>
        )}
        {tx.gasCost != null && tx.gasCost > 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {tx.gasCost.toFixed(4)} SUI
          </span>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            gasless
          </span>
        )}
      </div>
    </div>
  );
}

export function TransactionHistoryCard({ data }: { data: HistoryData }) {
  const txs = data.transactions.slice(0, VISIBLE_LIMIT);
  if (!txs.length) {
    return null;
  }

  const groups = groupByDate(txs);
  const isWatched = data.isSelfQuery === false && !!data.address;

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-end justify-between gap-4 border-border border-b px-5 py-4">
        <div>
          <h2 className="font-medium text-[15px] text-foreground tracking-[-0.014em]">
            Activity
          </h2>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
            {data.count} {data.count === 1 ? "operation" : "operations"}
          </div>
        </div>
        {isWatched && data.address && (
          <AddressBadge address={data.address} suinsName={data.suinsName} />
        )}
      </div>

      {Array.from(groups.entries()).map(([label, items]) => (
        <div key={label}>
          <div className="border-border border-t border-dashed px-5 pt-3 pb-1.5 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em] first:border-t-0">
            {label}
          </div>
          {items.map((tx) => (
            <HistoryRow key={tx.digest} tx={tx} />
          ))}
        </div>
      ))}

      {data.count > txs.length && (
        <div className="flex items-center justify-between border-border border-t px-5 py-3 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
          <span>
            Showing {txs.length} of {data.count}
          </span>
        </div>
      )}
    </div>
  );
}
