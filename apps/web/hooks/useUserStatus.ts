import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * [SIMPLIFICATION DAY 5] `onboarded` field removed from `UserStatus`. The
 * `User.onboardedAt` column was dropped along with the /setup wizard. Any
 * lingering `userStatus.onboarded` reads default to `true` (chat-first
 * means everyone is "onboarded" the moment they sign in). `markOnboarded`
 * is now a no-op kept for source-compat during the deprecation window —
 * the next dashboard pass deletes both.
 *
 * [PR-B2] `emailVerified` is still returned by `/api/user/status` (sourced
 * from the Google OIDC JWT claim) but no surface in the app gates on it
 * client-side anymore. The session-tier 429 message in `/api/engine/chat`
 * is the only place the unverified case is visible; the modal that used
 * to live here was deleted in PR-B2. Keeping the field in the response
 * type for any future "session usage today" UI.
 */
interface UserStatus {
  tosAccepted: boolean;
  emailVerified: boolean;
  sessionsUsed: number;
  sessionLimit: number;
  sessionWindowHours: number;
}

export function useUserStatus(address: string | null, jwt: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<UserStatus>({
    queryKey: ['user-status', address],
    enabled: !!address && !!jwt,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/user/status?address=${address}`, {
        headers: { 'x-zklogin-jwt': jwt! },
      });
      if (!res.ok) throw new Error('Failed to fetch user status');
      return res.json();
    },
  });

  const acceptTos = useCallback(async () => {
    if (!address || !jwt) return;
    await fetch('/api/user/tos-accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zklogin-jwt': jwt,
      },
      body: JSON.stringify({ address }),
    });
    queryClient.setQueryData(['user-status', address], (old: UserStatus | undefined) =>
      old
        ? { ...old, tosAccepted: true }
        : {
            tosAccepted: true,
            emailVerified: false,
            sessionsUsed: 0,
            sessionLimit: 5,
            sessionWindowHours: 24,
          },
    );
  }, [address, jwt, queryClient]);

  const markOnboarded = useCallback(async () => {
    // [SIMPLIFICATION DAY 5] No-op. /api/user/onboarded was deleted along
    // with the onboarding wizard. Kept as an exported function so any
    // remaining caller compiles until the dashboard pass strips it.
  }, []);

  return {
    loading: query.isLoading,
    onboarded: true,
    tosAccepted: query.data?.tosAccepted ?? true,
    emailVerified: query.data?.emailVerified ?? false,
    sessionsUsed: query.data?.sessionsUsed ?? 0,
    sessionLimit: query.data?.sessionLimit ?? 5,
    sessionWindowHours: query.data?.sessionWindowHours ?? 24,
    acceptTos,
    markOnboarded,
  };
}
