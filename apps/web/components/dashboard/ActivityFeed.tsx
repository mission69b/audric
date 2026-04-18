'use client';

import { useEffect } from 'react';
import { FilterChips } from './FilterChips';
import { ActivityCard, ActivityCardSkeleton } from './ActivityCard';
import type { useActivityFeed } from '@/hooks/useActivityFeed';
import type { ActivityFilter } from '@/lib/activity-types';

type FeedState = ReturnType<typeof useActivityFeed>;

interface ActivityFeedProps {
  feed: FeedState;
  onAction: (flow: string) => void;
}

const EMPTY_STATES: Record<ActivityFilter, { message: string; cta: string; flow: string }> = {
  all: { message: 'No activity yet.', cta: 'Make your first transaction', flow: 'save' },
  savings: { message: 'No savings activity yet.', cta: 'Save USDC', flow: 'save' },
  send: { message: 'No sends yet.', cta: 'Send USDC', flow: 'send' },
  receive: { message: 'No incoming transfers yet.', cta: 'Share your address', flow: 'receive' },
  swap: { message: 'No swaps yet.', cta: 'Swap tokens', flow: 'swap' },
  pay: { message: 'No API calls yet.', cta: 'Ask Audric anything', flow: 'help' },
  store: { message: 'No store activity yet.', cta: 'Open the store', flow: 'store' },
  autonomous: { message: 'No autonomous actions yet.', cta: 'Save USDC', flow: 'save' },
};

export function ActivityFeed({ feed, onAction }: ActivityFeedProps) {
  useEffect(() => {
    feed.markSeen();
  }, [feed.markSeen]);

  return (
    <div className="space-y-4">
      <FilterChips active={feed.filter} onChange={feed.setFilter} />

      {feed.isLoading && (
        <div className="space-y-1 divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <ActivityCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!feed.isLoading && feed.items.length === 0 && (
        <EmptyState filter={feed.filter} onAction={onAction} />
      )}

      {!feed.isLoading && feed.dateGroups.length > 0 && (
        <div className="space-y-5">
          {feed.dateGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-mono text-muted uppercase tracking-[0.15em] mb-2">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <ActivityCard key={item.id} item={item} network={feed.network} onAction={onAction} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {feed.hasNextPage && (
        <button
          onClick={() => feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="w-full py-3 text-xs font-mono text-foreground underline underline-offset-2 hover:opacity-70 transition disabled:opacity-50"
        >
          {feed.isFetchingNextPage ? 'Loading...' : 'Load more \u2193'}
        </button>
      )}
    </div>
  );
}

function EmptyState({ filter, onAction }: { filter: ActivityFilter; onAction: (flow: string) => void }) {
  const state = EMPTY_STATES[filter];

  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-center space-y-3">
      <p className="text-sm text-muted">{state.message}</p>
      <button
        onClick={() => onAction(state.flow)}
        className="rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium transition hover:opacity-90 active:scale-[0.97]"
      >
        {state.cta} →
      </button>
    </div>
  );
}
