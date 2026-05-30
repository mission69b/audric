"use client";

import { CardShell, fmtAmt, fmtUsd } from "./primitives";
import { AssetRow, CardState } from "./shared";

// PendingRewardsCardV2 — `pending_rewards` tool renderer.
// [R6.4 / A4 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`phase2-read-cards.html` R7): AssetRow list + dashed-footer total.
// Degraded / empty branches preserved from the prior `apps/web` port.

interface PendingReward {
  protocol: string;
  asset: string;
  coinType: string;
  symbol: string;
  amount: number;
  estimatedValueUsd: number;
}

export interface PendingRewardsCardV2Data {
  rewards: PendingReward[];
  totalValueUsd: number;
  degraded: boolean;
  degradationReason: string | null;
}

function degradedHeadline(reason: string | null): string {
  switch (reason) {
    case "PROTOCOL_UNAVAILABLE":
      return "NAVI rewards lookup unavailable";
    default:
      return "Rewards lookup failed";
  }
}

function isMultiProtocol(rewards: PendingReward[]): boolean {
  if (rewards.length === 0) {
    return false;
  }
  const first = rewards[0]?.protocol;
  return rewards.some((r) => r.protocol !== first);
}

export function PendingRewardsCardV2({
  data,
}: {
  data: PendingRewardsCardV2Data;
}) {
  if (data.degraded) {
    return (
      <CardShell
        badge={
          <span className="font-mono text-[11px] text-warning">feed offline</span>
        }
        title="Pending rewards"
      >
        <CardState
          sub="Try again in a moment — your unclaimed rewards aren't lost, just temporarily unreadable."
          title={degradedHeadline(data.degradationReason)}
        />
      </CardShell>
    );
  }

  if (data.rewards.length === 0) {
    return (
      <CardShell
        badge={
          <span className="font-mono text-[11px] text-muted-foreground">
            0 claimable
          </span>
        }
        title="Pending rewards"
      >
        <CardState
          sub="Rewards accrue as you save and provide liquidity. Check back tomorrow."
          title="Nothing to claim yet"
        />
      </CardShell>
    );
  }

  const showProtocol = isMultiProtocol(data.rewards);
  const sorted = [...data.rewards].sort(
    (a, b) => b.estimatedValueUsd - a.estimatedValueUsd
  );

  return (
    <CardShell
      badge={
        <span className="font-mono text-[11px] text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "reward" : "rewards"}
        </span>
      }
      footer={
        data.totalValueUsd > 0 ? (
          <>
            <span>Total claimable</span>
            <span className="text-foreground">${fmtUsd(data.totalValueUsd)}</span>
          </>
        ) : undefined
      }
      live
      title="Pending rewards"
    >
      <div>
        {sorted.map((r) => (
          <AssetRow
            amount={fmtAmt(r.amount, 4)}
            key={`${r.protocol}-${r.coinType}`}
            sub={showProtocol ? r.protocol : undefined}
            symbol={r.symbol}
            tone="success"
            value={r.estimatedValueUsd > 0 ? `$${fmtUsd(r.estimatedValueUsd)}` : "—"}
          />
        ))}
      </div>
    </CardShell>
  );
}
