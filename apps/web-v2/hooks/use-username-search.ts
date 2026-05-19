"use client";

/**
 * `useUsernameSearch` — SWR-backed reader for the Audric directory
 * prefix-search endpoint.
 *
 * Hits `/api/identity/search?q={prefix}&limit=10` via `audricWebUrl()`.
 * The endpoint lives on apps/web until v0.7e (cross-origin via the
 * NEXT_PUBLIC_AUDRIC_WEB_URL env, same-origin via Vercel rewrites
 * post-cutover — same plumbing as `useContacts` / `useUserStatus`).
 *
 * Wraps SWR with three small protocol details specific to autocomplete:
 *
 *   1. Empty / sub-2-char queries don't fire — too noisy a load and
 *      every user would burn a request typing the first letter. The
 *      hook returns an empty list synchronously.
 *
 *   2. 250ms debounce baked in via the cache key — every keystroke
 *      sets `query`, but SWR de-dupes within `dedupingInterval`. We
 *      ALSO debounce client-side via a setTimeout in the consumer,
 *      because SWR's dedup window only saves the network call, not
 *      the re-render churn (we want to skip the render too).
 *
 *   3. The endpoint silent-fails on invalid-charset queries (returns
 *      empty list), so consumers never see a 400 mid-typing.
 */

import { useDeferredValue, useEffect, useState } from "react";
import useSWR from "swr";
import { audricWebUrl } from "@/lib/audric-web-url";

export interface UsernameSearchHit {
  address: string;
  claimedAt: string;
  fullHandle: string;
  username: string;
}

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 250;

/** Debounce primitive — pulls the deferred input through a setTimeout. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useUsernameSearch(rawQuery: string) {
  const deferredQuery = useDeferredValue(rawQuery);
  const debouncedQuery = useDebouncedValue(deferredQuery, DEBOUNCE_MS);
  const trimmed = debouncedQuery.trim().toLowerCase();
  const shouldFetch = trimmed.length >= MIN_QUERY_LEN;

  const { data, isLoading } = useSWR<UsernameSearchHit[]>(
    shouldFetch ? `identity-search:${trimmed}` : null,
    async () => {
      const url = audricWebUrl(
        `/api/identity/search?q=${encodeURIComponent(trimmed)}&limit=10`
      );
      const res = await fetch(url);
      if (!res.ok) {
        return [];
      }
      const body = (await res.json()) as {
        results?: UsernameSearchHit[];
      };
      return body.results ?? [];
    },
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
    }
  );

  return {
    hits: data ?? [],
    isSearching: shouldFetch && isLoading,
    hasQuery: shouldFetch,
  };
}
