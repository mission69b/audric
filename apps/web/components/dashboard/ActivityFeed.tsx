'use client';

// [PHASE 6] ActivityFeed — re-skinned section header + day group spacing to
// match `design_handoff_audric/.../activity.jsx`.
//
// Section header now matches the prototype: mono uppercase day label · flex-1
// hairline divider · mono `N TXN` count. Rows render via the re-skinned
// <ActivityCard>. Empty state and load-more button use the new mono /
// surface-card visual language.
//
// Per Hard Rule 10 (typed mock stub for unsourced design rows), the
// "Suggestion confirmed / Suggestion snoozed" rows from the design are
// merged in from `getMockSuggestionItems()` when filter === 'all'. The
// underlying `useActivityFeed` data flow is untouched — `feed.dateGroups`
// stays read-only; we re-group the merged list locally for display.

import { useEffect, useMemo } from 'react';
import { FilterChips } from './FilterChips';
import { ActivityCard, ActivityCardSkeleton } from './ActivityCard';
import type { useActivityFeed } from '@/hooks/useActivityFeed';
import type { ActivityFilter, ActivityItem } from '@/lib/activity-types';
import { getMockSuggestionItems } from '@/lib/mocks/activity';

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

interface DateGroup {
  label: string;
  items: ActivityItem[];
}

function groupByDate(items: ActivityItem[]): DateGroup[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const groups: Map<string, ActivityItem[]> = new Map();
  const order: string[] = [];

  for (const item of items) {
    const d = new Date(item.timestamp);
    const ds = d.toDateString();
    let label: string;
    if (ds === todayStr) label = 'TODAY';
    else if (ds === yesterdayStr) label = 'YESTERDAY';
    else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    groups.get(label)!.push(item);
  }

  return order.map((label) => ({ label, items: groups.get(label)! }));
}

export function ActivityFeed({ feed, onAction }: ActivityFeedProps) {
  useEffect(() => {
    feed.markSeen();
  }, [feed.markSeen]);

  const displayGroups = useMemo<DateGroup[]>(() => {
    if (feed.filter !== 'all') {
      // Re-uppercase the existing labels so they match the new section header
      // styling. (`feed.dateGroups` returns "Today" / "Yesterday" / "Fri, Apr 17").
      return feed.dateGroups.map((g) => ({ label: g.label.toUpperCase(), items: g.items }));
    }
    const merged = [...feed.items, ...getMockSuggestionItems()].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    return groupByDate(merged);
  }, [feed.dateGroups, feed.items, feed.filter]);

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
