'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface BriefingContent {
  earned: number;
  savingsBalance: number;
  saveApy: number;
  idleUsdc: number;
  projectedDailyGain: number;
  healthFactor: number | null;
  debtBalance: number;
  cta: { type: string; label: string; amount?: number } | null;
  variant: 'savings' | 'idle' | 'debt_warning';
}

export interface BriefingData {
  date: string;
  content: BriefingContent;
  createdAt: string;
}

interface UseOvernightBriefingResult {
  briefing: BriefingData | null;
  loading: boolean;
  dismiss: () => Promise<void>;
}

export function useOvernightBriefing(
  address: string | null,
  jwt: string | null,
): UseOvernightBriefingResult {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['briefing', address],
    queryFn: async (): Promise<BriefingData | null> => {
      if (!address || !jwt) return null;

      const res = await fetch(`/api/user/briefing?address=${address}`, {
        headers: {
          'x-zklogin-jwt': jwt,
          'x-timezone-offset': String(new Date().getTimezoneOffset()),
        },
      });

      if (!res.ok) return null;

      const json = (await res.json()) as { briefing: BriefingData | null };
      return json.briefing;
    },
    enabled: !!address && !!jwt,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const dismiss = useCallback(async () => {
    if (!address || !jwt) return;

    try {
      await fetch('/api/user/briefing/dismiss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt,
        },
        body: JSON.stringify({ address }),
      });
    } catch {
      // best effort
    }

    queryClient.setQueryData(['briefing', address], null);
  }, [address, jwt, queryClient]);

  return {
    briefing: data ?? null,
    loading: isLoading,
    dismiss,
  };
}
