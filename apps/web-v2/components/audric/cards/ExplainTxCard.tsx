"use client";

import {
  CardShell,
  fmtRelativeTime,
  QRow,
  SUISCAN_ICON,
  SUISCAN_TX_URL,
} from "./primitives";

// ExplainTxCard — `explain_tx` tool renderer.
// [R6.4 / A4 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`phase2-read-cards.html` R12): plain-language summary + QRow detail
// rows + signed effect lines + dashed-footer digest/Suiscan link. Data
// shape preserved from the prior `apps/web` port.

interface TxExplanation {
  digest: string;
  sender: string;
  status: string;
  gasUsed: string;
  timestamp?: string;
  effects: { type: string; description: string }[];
  summary: string;
}

export function ExplainTxCard({ data }: { data: TxExplanation }) {
  const isSuccess = (data.status ?? "").toLowerCase() === "success";
  const shortDigest = `${data.digest.slice(0, 4)}…${data.digest.slice(-3)}`;
  const effects = data.effects.filter((e) => e.type !== "event");

  return (
    <CardShell
      footer={
        <>
          <span>{shortDigest}</span>
          <a
            className="inline-flex items-center gap-1 border-foreground/30 border-b text-foreground transition hover:border-foreground"
            href={`${SUISCAN_TX_URL}/${data.digest}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            View on Sui
            {SUISCAN_ICON}
          </a>
        </>
      }
      title="Transaction"
    >
      {data.summary && (
        <p className="mb-3 text-[13px] text-foreground tracking-[-0.011em]">
          {data.summary}
        </p>
      )}

      <div>
        <QRow label="Status">
          <span className={isSuccess ? "text-success" : "text-warning"}>
            {data.status}
          </span>
        </QRow>
        <QRow label="Gas">{data.gasUsed}</QRow>
        {data.timestamp && (
          <QRow label="Time">{fmtRelativeTime(data.timestamp)}</QRow>
        )}
      </div>

      {effects.length > 0 && (
        <div className="mt-3 space-y-1 border-border border-t pt-3">
          {effects.map((e, i) => {
            const match = e.description.match(
              /^(0x\S+)\s+(?:sent|received)\s+(.+)$/
            );
            const amount = match ? match[2] : e.description;
            const addr = match ? match[1] : null;
            const prefix = e.type === "send" ? "↑ −" : "↓ +";
            return (
              <div
                className="flex items-baseline justify-between font-mono text-[11px]"
                key={`${e.type}-${i}`}
              >
                <span className={e.type === "send" ? "text-warning" : "text-success"}>
                  {prefix}
                  {amount}
                </span>
                {addr && (
                  <span className="text-[10px] text-muted-foreground">{addr}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CardShell>
  );
}
