'use client';

// [PHASE 6] Activity panel — re-skinned to match
// `design_handoff_audric/.../activity.jsx`.
//
// Layout:
//   • <BalanceHero> at top (large serif total + AVAILABLE / EARNING eyebrow)
//   • Centered, wrapped <FilterChips> row using the <Pill> primitive
//   • Day-grouped feed sections with a [LABEL · divider · N TXN] header
//   • Re-skinned single-row <ActivityCard>s
//
// Behavior unchanged: wraps the same <ActivityFeed> + `useActivityFeed` data
// path the previous skin did. The new `balance` prop only feeds the visual
// hero — the activity data still comes from `feed`.

import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { BalanceHero } from '@/components/ui/BalanceHero';
import type { useActivityFeed } from '@/hooks/useActivityFeed';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

type FeedState = ReturnType<typeof useActivityFeed>;

interface ActivityPanelProps {
  feed: FeedState;
  balance: BalanceHeaderData;
  onAction: (flow: string) => void;
  onExplainTx?: (digest: string) => void;
}

export function ActivityPanel({ feed, balance, onAction, onExplainTx }: ActivityPanelProps) {
  return (
    <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-[18px]">
      <div className="pt-5 pb-4">
        <BalanceHero
          total={balance.total}
          available={balance.cash}
          earning={balance.savings}
          size="lg"
        />
      </div>
      <ActivityFeed feed={feed} onAction={onAction} onExplainTx={onExplainTx} />
    </div>
  );
}
