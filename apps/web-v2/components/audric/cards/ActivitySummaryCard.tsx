"use client";

import { CardShell, fmtUsd, MiniBar, QRow } from "./primitives";
import { MetricBlock } from "./shared";

// ActivitySummaryCard — `activity_summary` tool renderer.
// [R6.4 / A4 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`phase2-read-cards.html` R11): hero op-count MetricBlock + allocation
// MiniBar + QRow breakdown rows + dashed-footer totals. Data shape
// preserved from the prior `apps/web` port.

interface ActionBreakdown {
  action: string;
  count: number;
  totalAmountUsd: number;
}

interface ActivityData {
  period: string;
  totalTransactions: number;
  byAction: ActionBreakdown[];
  totalMovedUsd: number;
  netSavingsUsd: number;
  yieldEarnedUsd: number;
}

function periodLabel(period: string): string {
  const now = new Date();
  switch (period) {
    case "week":
      return "This week";
    case "month":
      return now.toLocaleDateString("en-US", { month: "long" });
    case "year":
      return String(now.getFullYear());
    case "all":
      return "All time";
    default:
      return period;
  }
}

export function ActivitySummaryCard({ data }: { data: ActivityData }) {
  const total = data.totalTransactions;
  const segments = data.byAction.slice(0, 4).map((a) => ({
    label: a.action,
    percentage: total > 0 ? (a.count / total) * 100 : 0,
    value: a.count,
  }));

  return (
    <CardShell
      badge={
        <span className="font-mono text-[11px] text-muted-foreground">
          {periodLabel(data.period)}
        </span>
      }
      live
      title="Activity"
    >
      <MetricBlock
        label="Operations"
        sub={`${periodLabel(data.period)} · ${data.totalTransactions} total`}
        value={data.totalTransactions}
      />

      {segments.length > 0 && (
        <div className="mt-3">
          <MiniBar segments={segments} />
        </div>
      )}

      <div className="mt-3 border-border border-t pt-1">
        {data.byAction.map((a) => (
          <QRow key={a.action} label={<span className="capitalize">{a.action}</span>}>
            {a.count} · ${fmtUsd(a.totalAmountUsd)}
          </QRow>
        ))}
      </div>

      <div className="mt-2">
        <QRow label="Total moved">${fmtUsd(data.totalMovedUsd)}</QRow>
        <QRow label="Net savings" tone="up">
          ${fmtUsd(data.netSavingsUsd)}
        </QRow>
        {data.yieldEarnedUsd > 0 && (
          <QRow label="Yield earned" tone="up">
            ${fmtUsd(data.yieldEarnedUsd)}
          </QRow>
        )}
      </div>
    </CardShell>
  );
}
