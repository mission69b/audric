"use client";

/**
 * `useUserStatus` — SWR-backed reader for `/api/user/status` on web-v2.
 *
 * Migrated from `@tanstack/react-query` to SWR in v0.7c Session 4.7.A as
 * part of the data-fetching standardization. `react-query` remains in the
 * dependency tree only as plumbing for `@mysten/dapp-kit`'s internal
 * state — no user-written code uses it directly anymore.
 *
 * Settings → Passport reads `userStatus.username` for the IDENTITY card.
 *
 * [S.261 — 2026-05-23] Dropped `tosAccepted` flag + `acceptTos()` callback
 * alongside the dead `User.tosAcceptedAt` column. The TOS modal that
 * consumed the flag was retired with the apps/web archive; `acceptTos()`
 * had zero callers. Hook surface is now strictly identity + session-tier.
 */

import useSWR from "swr";
import { audricWebUrl } from "@/lib/audric-web-url";

interface UserStatus {
  emailVerified: boolean;
  sessionLimit: number;
  sessionsUsed: number;
  sessionWindowHours: number;
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
      // 5min cache; user-status changes infrequently (username claim,
      // session-tier transitions) and the username-claim path optimistically
      // patches the cache on success.
      dedupingInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
    }
  );

  return {
    loading: isLoading,
    emailVerified: data?.emailVerified ?? DEFAULT_STATUS.emailVerified,
    sessionsUsed: data?.sessionsUsed ?? DEFAULT_STATUS.sessionsUsed,
    sessionLimit: data?.sessionLimit ?? DEFAULT_STATUS.sessionLimit,
    sessionWindowHours:
      data?.sessionWindowHours ?? DEFAULT_STATUS.sessionWindowHours,
    username: data?.username ?? null,
    usernameClaimedAt: data?.usernameClaimedAt ?? null,
    refetch: mutate,
  };
}
