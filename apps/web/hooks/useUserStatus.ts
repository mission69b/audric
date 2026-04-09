import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

interface UserStatus {
  onboarded: boolean;
  tosAccepted: boolean;
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
      old ? { ...old, tosAccepted: true } : { onboarded: false, tosAccepted: true },
    );
  }, [address, jwt, queryClient]);

  const markOnboarded = useCallback(async () => {
    if (!address || !jwt) return;
    await fetch('/api/user/onboarded', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zklogin-jwt': jwt,
      },
      body: JSON.stringify({ address }),
    });
    queryClient.setQueryData(['user-status', address], (old: UserStatus | undefined) =>
      old ? { ...old, onboarded: true } : { onboarded: true, tosAccepted: false },
    );
  }, [address, jwt, queryClient]);

  return {
    loading: query.isLoading,
    onboarded: query.data?.onboarded ?? true,
    tosAccepted: query.data?.tosAccepted ?? true,
    acceptTos,
    markOnboarded,
  };
}
