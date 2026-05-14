'use client';

// useActivityFeed — paginated activity stream backed by /api/activity.
//
// [Filter chips removal / 2026-05-10] Dropped the `filter` / `setFilter`
// state and the `type` query param. Activity is a single chronological
// stream — agents are the filter ("show me my swaps this week"). The
// query key no longer needs a filter dimension; the cache is flat.

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityItem, ActivityPage } from '@/lib/activity-types';
import { authFetch } from '@/lib/auth-fetch';

const LS_LAST_SEEN_PREFIX = 'audric:activity-last-seen:';

function getLastSeen(address: string): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(`${LS_LAST_SEEN_PREFIX}${address}`);
  return raw ? Number(raw) : 0;
}

function setLastSeen(address: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${LS_LAST_SEEN_PREFIX}${address}`, String(Date.now()));
}

export interface DateGroup {
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
  const groupOrder: string[] = [];

  for (const item of items) {
    const d = new Date(item.timestamp);
    const ds = d.toDateString();

    let label: string;
    if (ds === todayStr) {
      label = 'Today';
    } else if (ds === yesterdayStr) {
      label = 'Yesterday';
    } else {
      label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
      groupOrder.push(label);
    }
    groups.get(label)!.push(item);
  }

  return groupOrder.map((label) => ({ label, items: groups.get(label)! }));
}

export function useActivityFeed(address: string | null) {
  const query = useInfiniteQuery<ActivityPage, Error, { pages: ActivityPage[]; pageParams: (string | undefined)[] }, string[], string | undefined>({
    queryKey: ['activity-feed', address ?? ''],
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        address: address!,
        limit: '20',
      });
      if (pageParam) params.set('cursor', pageParam);
      const res = await authFetch(`/api/activity?${params}`);
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  const dateGroups = useMemo(() => groupByDate(items), [items]);

  const latestTimestamp = items.length > 0 ? items[0].timestamp : 0;
  const hasUnread = address ? latestTimestamp > getLastSeen(address) : false;

  const markSeen = useCallback(() => {
    if (address) setLastSeen(address);
  }, [address]);

  return {
    items,
    dateGroups,
    isLoading: query.isLoading,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    hasUnread,
    markSeen,
    network: query.data?.pages[0]?.network ?? 'mainnet',
  };
}
