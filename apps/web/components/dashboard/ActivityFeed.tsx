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

import { useEffect } from 'react';
import { FilterChips } from './FilterChips';
import { ActivityCard, ActivityCardSkeleton } from './ActivityCard';
import type { useActivityFeed } from '@/hooks/useActivityFeed';
import type { ActivityFilter, ActivityItem } from '@/lib/activity-types';

type FeedState = ReturnType<typeof useActivityFeed>;

interface ActivityFeedProps {
  feed: FeedState;
  onAction: (flow: string) => void;
  onExplainTx?: (digest: string) => void;
}

const EMPTY_STATES: Record<ActivityFilter, { message: string; cta: string; flow: string }> = {
  all: { message: 'No activity yet.', cta: 'Make your first transaction', flow: 'save' },
  savings: { message: 'No savings activity yet.', cta: 'Save USDC', flow: 'save' },
  send: { message: 'No sends yet.', cta: 'Send USDC', flow: 'send' },
  receive: { message: 'No incoming transfers yet.', cta: 'Share your address', flow: 'receive' },
  swap: { message: 'No swaps yet.', cta: 'Swap tokens', flow: 'swap' },
  pay: { message: 'No API calls yet.', cta: 'Ask Audric anything', flow: 'help' },
  store: { message: 'No store activity yet.', cta: 'Open the store', flow: 'store' },
};

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
  // [Activity rebuild / 2026-05-10] Removed the `filter === 'all'` mock
  // injection branch — see the file-header comment.
  const displayGroups: DateGroup[] = feed.dateGroups.map((g) => ({
    label: g.label.toUpperCase(),
    items: g.items,
  }));

  return (
    <div className="space-y-4">
      <FilterChips active={feed.filter} onChange={feed.setFilter} />

      {feed.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <ActivityCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!feed.isLoading && displayGroups.length === 0 && (
        <EmptyState filter={feed.filter} onAction={onAction} />
      )}

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

function EmptyState({
  filter,
  onAction,
}: {
  filter: ActivityFilter;
  onAction: (flow: string) => void;
}) {
  const state = EMPTY_STATES[filter];
  return (
    <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center space-y-3">
      <p className="text-sm text-fg-secondary">{state.message}</p>
      <button
        type="button"
        onClick={() => onAction(state.flow)}
        className="inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-pill border border-border-subtle bg-transparent font-mono text-[10px] leading-[14px] tracking-[0.1em] uppercase text-fg-secondary hover:bg-surface-card hover:border-border-strong hover:text-fg-primary transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
      >
        {state.cta} &rsaquo;
      </button>
    </div>
  );
}
