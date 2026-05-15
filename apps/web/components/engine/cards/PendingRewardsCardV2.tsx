'use client';

import { CardShell, fmtUsd } from './primitives';
import { AssetAmountBlock } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 37 v0.7a Phase 2 Day 16 — PendingRewardsCardV2 (TOOL_UX_DESIGN baseline)
//
// Per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15):
//   Pattern: generative-UI
//   componentKey: `PendingRewardsCard`
//   Shared components: AssetAmountBlock × N (one per claimable reward)
//
// Layout:
//   ┌─────────────────────────────────────────────┐
//   │ Pending rewards                             │
//   ├─────────────────────────────────────────────┤
//   │ ─ AssetAmountBlock per reward, sorted by    │
//   │   USD value desc                            │
//   │ ─ Each row: symbol · amount · USD value     │
//   │ ─ Optional protocol eyebrow (NAVI, Suilend) │
//   │   when multi-protocol rewards land          │
//   ├─────────────────────────────────────────────┤
//   │ Total claimable · $X                        │ (footer chip)
//   └─────────────────────────────────────────────┘
//
// Why parallel to PendingRewardsCard.tsx (not a replacement): same
// rationale as the prior V2 components in this batch — flag-gated
// rollout (NEXT_PUBLIC_PENDING_REWARDS_CARD_V2) lets the founder
// review V2 side-by-side before the Day 27-28 cutover lands.
//
// What V2 ADDS over v1:
//   - AssetAmountBlock per reward (consistent rendering across cards)
//   - Sorted by USD value desc (v1 renders in engine emit order)
//   - Protocol eyebrow on the AssetAmountBlock label slot when multi-
//     protocol (today only NAVI; future Suilend / Scallop drops in
//     without component change)
//
// V2 PRESERVES v1's three render states:
//   - Healthy + claimable → list of AssetAmountBlocks + total footer
//   - Healthy + nothing   → quiet "No claimable rewards yet" line
//   - Degraded            → warning state with protocol-aware headline
//
// CTA decision unchanged from v1 (SPEC 23B-N5): data-only by design.
// The "🌾 HARVEST ALL" / "🎁 JUST CLAIM" suggested-action chips below
// the assistant turn already cover both natural next moves; an in-card
// button would duplicate them. That decision is documented in the v1
// PendingRewardsCard.tsx header and stays binding for V2.
// ───────────────────────────────────────────────────────────────────────────

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
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

function degradedHeadline(reason: string | null): string {
  switch (reason) {
    case 'PROTOCOL_UNAVAILABLE':
      return 'NAVI rewards lookup unavailable';
    case 'UNKNOWN':
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
            className="text-warning-solid text-[12px] leading-none mt-0.5"
            aria-hidden="true"
          >
            ⚠
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-fg-primary">
              {degradedHeadline(data.degradationReason)}
            </p>
            <p className="text-[11px] text-fg-muted mt-0.5">
              Try again in a moment — your unclaimed rewards aren&apos;t
              lost, just temporarily unreadable.
            </p>
          </div>
        </div>
      </CardShell>
    );
  }

  if (data.rewards.length === 0) {
    return (
      <CardShell title="Pending rewards">
        <p className="text-sm text-fg-muted">No claimable rewards yet.</p>
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
          <div className="pt-2 border-t border-border-subtle flex items-baseline justify-between">
            <span className={SECTION_LABEL}>Total claimable</span>
            <span className="text-fg-primary font-mono text-sm tabular-nums">
              ${fmtUsd(data.totalValueUsd)}
            </span>
          </div>
        )}
      </div>
    </CardShell>
  );
}
