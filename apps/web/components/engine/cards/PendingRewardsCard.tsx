'use client';

import { CardShell, fmtUsd } from './primitives';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B — N5 — PendingRewardsCard
//
// Visualizes the `pending_rewards` engine tool result (S.119 / S18-F20).
// Pre-N5 the tool fell through to `null` in CARD_RENDERERS — the user
// only saw the LLM's prose ("you have 0.0165 vSUI ≈ $0.04 pending") with
// no UI confirmation of the per-asset breakdown.
//
// Tool shape (`packages/engine/src/tools/pending-rewards.ts`):
//   { rewards: PendingReward[], totalValueUsd, degraded, degradationReason }
//   PendingReward = { protocol, asset, coinType, symbol, amount, estimatedValueUsd }
//
// Render shape (3 states):
//   Healthy + claimable    → table (Symbol · Amount · USD) + total footer
//   Healthy + nothing      → quiet "No claimable rewards yet" line
//   Degraded               → warning state with the protocol name surfaced
//
// CTA decision: data-only by deliberate choice (SPEC 23B-N5 design call,
// 2026-05-12). The "🌾 HARVEST ALL" + "🎁 JUST CLAIM" chips already
// registered for `pending_rewards` in `lib/suggested-actions.ts:131-134`
// render below the assistant's narration and provide both natural next
// moves; an in-card "Harvest" button would duplicate the chip CTA AND
// only cover one of the two paths the chips already cover.
// ───────────────────────────────────────────────────────────────────────────

interface PendingReward {
  protocol: string;
  asset: string;
  coinType: string;
  symbol: string;
  amount: number;
  estimatedValueUsd: number;
}

interface PendingRewardsData {
  rewards: PendingReward[];
  totalValueUsd: number;
  degraded: boolean;
  degradationReason: string | null;
}

function formatRewardAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  if (amount >= 1) return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (amount >= 0.0001) return amount.toFixed(6).replace(/\.?0+$/, '');
  // Sub-0.0001 — show 6dp truncation rather than scientific notation; users
  // reading a wallet UI expect "0.000001" not "1.00e-6".
  return amount.toFixed(8).replace(/\.?0+$/, '');
}

// Map raw degradationReason codes to a user-readable protocol label.
// Today only NAVI surfaces rewards; if a future protocol joins (e.g.
// Suilend, Scallop) extend this map and the source of degradation will
// stay identifiable on the card.
function degradedHeadline(reason: string | null): string {
  switch (reason) {
    case 'PROTOCOL_UNAVAILABLE':
      return 'NAVI rewards lookup unavailable';
    case 'UNKNOWN':
    default:
      return 'Rewards lookup failed';
  }
}

export function PendingRewardsCard({ data }: { data: PendingRewardsData }) {
  if (data.degraded) {
    return (
      <CardShell title="Pending Rewards">
        <div className="flex items-start gap-2 py-1">
          <span className="text-warning-solid text-[12px] leading-none mt-0.5" aria-hidden="true">
            ⚠
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-fg-primary">{degradedHeadline(data.degradationReason)}</p>
            <p className="text-[11px] text-fg-muted mt-0.5">
              Try again in a moment — your unclaimed rewards aren&apos;t lost, just temporarily unreadable.
            </p>
          </div>
        </div>
      </CardShell>
    );
  }

  if (data.rewards.length === 0) {
    return (
      <CardShell title="Pending Rewards">
        <p className="text-sm text-fg-muted">No claimable rewards yet.</p>
      </CardShell>
    );
  }

  const showUsdColumn = data.rewards.some((r) => r.estimatedValueUsd > 0);

  return (
    <CardShell title="Pending Rewards">
      <table className="w-full">
        <thead>
          <tr className="text-fg-muted text-[10px]">
            <th className="text-left font-medium pb-1">Reward</th>
            <th className="text-right font-medium pb-1">Amount</th>
            {showUsdColumn && <th className="text-right font-medium pb-1">Value</th>}
          </tr>
        </thead>
        <tbody className="font-mono">
          {data.rewards.map((r) => (
            <tr key={`${r.protocol}-${r.coinType}`} className="border-t border-border-subtle/50">
              <td className="py-1 text-fg-primary font-medium">{r.symbol}</td>
              <td className="py-1 text-right text-fg-muted">{formatRewardAmount(r.amount)}</td>
              {showUsdColumn && (
                <td className="py-1 text-right text-fg-muted">
                  {r.estimatedValueUsd > 0 ? `$${fmtUsd(r.estimatedValueUsd)}` : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {data.totalValueUsd > 0 && (
        <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border-subtle font-mono text-[11px]">
          <span className="text-fg-muted text-[10px] uppercase tracking-[0.08em]">Total claimable</span>
          <span className="text-fg-primary">${fmtUsd(data.totalValueUsd)}</span>
        </div>
      )}
    </CardShell>
  );
}
