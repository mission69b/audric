// [PHASE 13] Marketing — extracted from the old `app/page.tsx` monolith.
// Single source of truth for the metrics band on the landing page.
//
// Endpoint: `/api/stats` (GET) — returns counts that power the marketing
// metrics tiles. Cached server-side via `export const revalidate = 60` on the
// route, so this hook does not need its own SWR/cache layer.

'use client';

import { useEffect, useState } from 'react';

export interface MarketingStats {
  totalUsers: number;
  totalSessions: number;
  totalTransactions: number;
  totalToolExecutions: number;
  totalTokens: number;
}

export function useStats(): MarketingStats | null {
  const [stats, setStats] = useState<MarketingStats | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats(data as MarketingStats);
      })
      .catch(() => {
        // Silent — metrics tiles fall back to em-dash via fmtStat()
      });
  }, []);

  return stats;
}

export function fmtStat(n: number | undefined): string {
  if (n === undefined || n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
