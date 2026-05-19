"use client";

/**
 * `useUserStatus` — port from `apps/web/hooks/useUserStatus.ts`.
 *
 * Settings → Passport reads `userStatus.username` for the IDENTITY card.
 * The route stays on apps/web until v0.7e; uses `audricWebUrl()` to
 * resolve to either same-origin (post-cutover) or cross-origin
 * (pre-cutover preview testing via NEXT_PUBLIC_AUDRIC_WEB_URL).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { audricWebUrl } from "@/lib/audric-web-url";

interface UserStatus {
  emailVerified: boolean;
  sessionLimit: number;
  sessionsUsed: number;
  sessionWindowHours: number;
  tosAccepted: boolean;
  /** Bare lowercased Audric username, or `null` when unclaimed. */
  username: string | null;
  /** ISO timestamp when the user claimed; `null` when unclaimed. */
  usernameClaimedAt: string | null;
}

export function useUserStatus(address: string | null, jwt: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<UserStatus>({
    queryKey: ["user-status", address],
    enabled: !!address && !!jwt,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        audricWebUrl(`/api/user/status?address=${address}`),
        {
          headers: { "x-zklogin-jwt": jwt as string },
        }
      );
      if (!res.ok) {
        throw new Error("Failed to fetch user status");
      }
      return res.json();
    },
  });

  const acceptTos = useCallback(async () => {
    if (!address || !jwt) {
      return;
    }
    await fetch(audricWebUrl("/api/user/tos-accept"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zklogin-jwt": jwt,
      },
      body: JSON.stringify({ address }),
    });
    queryClient.setQueryData(
      ["user-status", address],
      (old: UserStatus | undefined) =>
        old
          ? { ...old, tosAccepted: true }
          : {
              tosAccepted: true,
              emailVerified: false,
              sessionsUsed: 0,
              sessionLimit: 5,
              sessionWindowHours: 24,
              username: null,
              usernameClaimedAt: null,
            }
    );
  }, [address, jwt, queryClient]);

  return {
    loading: query.isLoading,
    tosAccepted: query.data?.tosAccepted ?? true,
    emailVerified: query.data?.emailVerified ?? false,
    sessionsUsed: query.data?.sessionsUsed ?? 0,
    sessionLimit: query.data?.sessionLimit ?? 5,
    sessionWindowHours: query.data?.sessionWindowHours ?? 24,
    username: query.data?.username ?? null,
    usernameClaimedAt: query.data?.usernameClaimedAt ?? null,
    acceptTos,
    refetch: query.refetch,
  };
}
