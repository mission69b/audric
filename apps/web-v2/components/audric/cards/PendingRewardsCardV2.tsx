'use client';

import { CardShell, fmtUsd } from './primitives';
import { AssetAmountBlock } from './shared';

// PendingRewardsCardV2 — `pending_rewards` tool renderer (TOOL_UX_DESIGN
// baseline shape). Ported from
// `apps/web/components/engine/cards/PendingRewardsCardV2.tsx` by Phase
// 5a.4 (renderer migration sweep, 2026-05-19). Verbatim except import
// paths.

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

const SECTION_LABEL =
  'text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground';

function degradedHeadline(reason: string | null): string {
  switch (reason) {
    case 'PROTOCOL_UNAVAILABLE':
      return 'NAVI rewards lookup unavailable';
    default:
      return 'Rewards lookup failed';
  }
}

function isMultiProtocol(rewards: PendingReward[]): boolean {
  if (rewards.length === 0) return false;
  const first = rewards[0]!.protocol;
  return rewards.some((r) => r.protocol !== first);
}

export function PendingRewardsCardV2({
  data,
}: {
  data: PendingRewardsCardV2Data;
}) {
  if (data.degraded) {
    return (
      <CardShell title="Pending rewards">
        <div className="flex items-start gap-2 py-1">
          <span
            className="text-warning text-[12px] leading-none mt-0.5"
            aria-hidden="true"
          >
            ⚠
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">
              {degradedHeadline(data.degradationReason)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Try again in a moment — your unclaimed rewards aren&apos;t lost,
              just temporarily unreadable.
            </p>
          </div>
        </div>
      </CardShell>
    );
  }

  if (data.rewards.length === 0) {
    return (
      <CardShell title="Pending rewards">
        <p className="text-sm text-muted-foreground">No claimable rewards yet.</p>
      </CardShell>
    );
  }

  const showProtocolEyebrow = isMultiProtocol(data.rewards);
  const sorted = [...data.rewards].sort(
    (a, b) => b.estimatedValueUsd - a.estimatedValueUsd,
  );

  return (
    <CardShell title="Pending rewards">
      <div className="space-y-3">
        <div className="space-y-2">
          {sorted.map((r) => (
            <AssetAmountBlock
              key={`${r.protocol}-${r.coinType}`}
              asset={r.symbol}
              amount={r.amount}
              usdValue={r.estimatedValueUsd > 0 ? r.estimatedValueUsd : null}
              label={showProtocolEyebrow ? r.protocol : undefined}
            />
          ))}
        </div>

        {data.totalValueUsd > 0 && (
          <div className="pt-2 border-t border-border flex items-baseline justify-between">
            <span className={SECTION_LABEL}>Total claimable</span>
            <span className="text-foreground font-mono text-sm tabular-nums">
              ${fmtUsd(data.totalValueUsd)}
            </span>
          </div>
        )}
      </div>
    </CardShell>
  );
}
