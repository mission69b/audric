'use client';

// ActivityFeed — section header + day group rendering for the activity panel.
//
// Section header: mono uppercase day label · flex-1 hairline divider · mono
// `N TXN` count. Rows render via <ActivityCard>. Empty state and load-more
// button use the surface-card visual language.
//
// [Activity rebuild / 2026-05-10] The "Suggestion confirmed / Suggestion
// snoozed" mock-suggestion-row injection (formerly under "Hard Rule 10")
// was removed — the autonomy stack that would have written real
// suggestion events was retired and the mocks were misleading users
// into thinking they had taken actions they hadn't. `getMockSuggestionItems`
// + `lib/mocks/activity.ts` were deleted in the same change.
//
// [Filter chips removal / 2026-05-10] The horizontal filter chip row
// (All / Savings / Send / Receive / Swap / Pay / Store) was deleted.
// Audric is chat-first — the agent IS the filter ("show me my swaps
// this week" → richer than any chip would surface). Chips were
// duplicating the sidebar's product-tour role, multiplying empty
// states (one per filter), and forcing every new feature class to
// make a chip-taxonomy decision. Activity is now a single
// chronological stream.

import { useEffect } from 'react';
import { ActivityCard, ActivityCardSkeleton } from './ActivityCard';
import type { useActivityFeed } from '@/hooks/useActivityFeed';
import type { ActivityItem } from '@/lib/activity-types';

type FeedState = ReturnType<typeof useActivityFeed>;

interface ActivityFeedProps {
  feed: FeedState;
  onAction: (flow: string) => void;
  onExplainTx?: (digest: string) => void;
}

interface DateGroup {
  label: string;
  items: ActivityItem[];
}

export function ActivityFeed({ feed, onAction, onExplainTx }: ActivityFeedProps) {
  // Destructure first so the effect dep is the stable `useCallback` reference
  // (from useActivityFeed) rather than a member access — the lint rule
  // can't reason about `feed.markSeen` being stable, but extracting it does
  // the right thing.
  const { markSeen } = feed;
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  // Re-uppercase the existing labels so they match the section header
  // styling. (`feed.dateGroups` returns "Today" / "Yesterday" / "Fri, Apr 17".)
  const displayGroups: DateGroup[] = feed.dateGroups.map((g) => ({
    label: g.label.toUpperCase(),
    items: g.items,
  }));

  return (
    <div className="space-y-4">
      {feed.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <ActivityCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!feed.isLoading && displayGroups.length === 0 && <EmptyState onAction={onAction} />}

      {!feed.isLoading && displayGroups.length > 0 && (
        <div className="space-y-5">
          {displayGroups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <header className="flex items-center gap-2.5 mb-2.5">
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
                  {group.label}
                </span>
                <span aria-hidden="true" className="flex-1 h-px bg-border-subtle" />
                <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
                  {group.items.length} TXN
                </span>
              </header>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <ActivityCard
                    key={item.id}
                    item={item}
                    network={feed.network}
                    onAction={onAction}
                    onExplainTx={onExplainTx}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {feed.hasNextPage && (
        <button
          onClick={() => feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="w-full py-3 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary hover:text-fg-primary transition disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
        >
          {feed.isFetchingNextPage ? 'Loading\u2026' : 'Load more \u2193'}
        </button>
      )}
    </div>
  );
}

function EmptyState({ onAction }: { onAction: (flow: string) => void }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center space-y-3">
      <p className="text-sm text-fg-secondary">No activity yet.</p>
      <button
        type="button"
        onClick={() => onAction('save')}
        className="inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-pill border border-border-subtle bg-transparent font-mono text-[10px] leading-[14px] tracking-[0.1em] uppercase text-fg-secondary hover:bg-surface-card hover:border-border-strong hover:text-fg-primary transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
      >
        Make your first transaction &rsaquo;
      </button>
    </div>
  );
}
