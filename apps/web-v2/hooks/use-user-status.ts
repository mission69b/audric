"use client";

/**
 * `useUserStatus` — SWR-backed reader for `/api/user/status` on apps/web.
 *
 * Migrated from `@tanstack/react-query` to SWR in v0.7c Session 4.7.A as
 * part of the data-fetching standardization. `react-query` remains in the
 * dependency tree only as plumbing for `@mysten/dapp-kit`'s internal
 * state — no user-written code uses it directly anymore.
 *
 * Settings → Passport reads `userStatus.username` for the IDENTITY card.
 * The route stays on apps/web until v0.7e; uses `audricWebUrl()` to
 * resolve to either same-origin (post-cutover) or cross-origin
 * (pre-cutover preview testing via NEXT_PUBLIC_AUDRIC_WEB_URL).
 *
 * `acceptTos()` posts to `/api/user/tos-accept` and optimistically
 * patches the cache via SWR's `mutate(updater, { revalidate: false })`.
 * No revalidation needed — the server returns no body, the only change
 * is the boolean `tosAccepted` flag, and the optimistic patch is the
 * authoritative new state.
 */

import { useCallback } from "react";
import useSWR from "swr";
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

const DEFAULT_STATUS: UserStatus = {
  emailVerified: false,
  sessionLimit: 5,
  sessionsUsed: 0,
  sessionWindowHours: 24,
  tosAccepted: false,
  username: null,
  usernameClaimedAt: null,
};

export function useUserStatus(address: string | null, jwt: string | undefined) {
  const swrKey = address && jwt ? `user-status:${address}` : null;

  const { data, isLoading, mutate } = useSWR<UserStatus>(
    swrKey,
    async () => {
      const res = await fetch(
        audricWebUrl(`/api/user/status?address=${address}`),
        { headers: { "x-zklogin-jwt": jwt as string } }
      );
      if (!res.ok) {
        throw new Error("Failed to fetch user status");
      }
      return res.json();
    },
    {
      // 5min cache; user-status changes infrequently (TOS accept, username
      // claim) and both update paths optimistically patch the cache.
      dedupingInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
    }
  );

  const acceptTos = useCallback(async () => {
    if (!address || !jwt) {
      return;
    }
    await mutate(
      async (current) => {
        await fetch(audricWebUrl("/api/user/tos-accept"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-zklogin-jwt": jwt,
          },
          body: JSON.stringify({ address }),
        });
        return current
          ? { ...current, tosAccepted: true }
          : { ...DEFAULT_STATUS, tosAccepted: true };
      },
      {
        optimisticData: (current) =>
          current
            ? { ...current, tosAccepted: true }
            : { ...DEFAULT_STATUS, tosAccepted: true },
        rollbackOnError: true,
        revalidate: false,
      }
    );
  }, [address, jwt, mutate]);

  return {
    loading: isLoading,
    tosAccepted: data?.tosAccepted ?? true,
    emailVerified: data?.emailVerified ?? false,
    sessionsUsed: data?.sessionsUsed ?? 0,
    sessionLimit: data?.sessionLimit ?? 5,
    sessionWindowHours: data?.sessionWindowHours ?? 24,
    username: data?.username ?? null,
    usernameClaimedAt: data?.usernameClaimedAt ?? null,
    acceptTos,
    refetch: mutate,
  };
}
