"use client";

/**
 * `usePreferences` — single SWR cache slot for `/api/user/preferences`.
 *
 * Shipped in v0.7c Session 4.7.A as the canonical reader for everything
 * persisted on the user-preferences endpoint. Today the sole consumer
 * is `SafetySection` (settings → safety). When the safety tab mounts
 * the SWR cache is populated; subsequent renders use the cached value.
 *
 * Replaces the raw `useState/useEffect/useRef` patterns previously
 * used by `safety-section` (manual loading state). SWR's
 * `dedupingInterval` provides built-in dedup for free.
 *
 * Mutation contract: `updatePreset` (safety-section) posts to the same
 * route with a partial payload. The server merges the partial into
 * the persisted record. The `mutate` returned from this hook accepts
 * an optimistic updater that patches only the affected field;
 * rollback-on-error is built in.
 *
 * [S.243 / V07E_CONTACTS_SIMPLIFICATION Path A — 2026-05-22] Pre-S.243,
 * `useContacts` was the second consumer of this hook; the `contacts`
 * field on `UserPreferences` was the cache for the contacts list. With
 * contacts deleted, the field is gone. The wire endpoint (apps/web side)
 * still returns `contacts` until apps/web is archived in v0.7e Phase 2;
 * web-v2 just ignores it.
 */

import useSWR from "swr";
import { audricWebUrl } from "@/lib/audric-web-url";
import { authFetch } from "@/lib/auth-fetch";

export type PermissionPreset = "conservative" | "balanced" | "aggressive";

export interface UserPreferences {
  permissionPreset: PermissionPreset;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  permissionPreset: "balanced",
};

const VALID_PRESETS: readonly PermissionPreset[] = [
  "conservative",
  "balanced",
  "aggressive",
] as const;

function isValidPreset(value: unknown): value is PermissionPreset {
  return (
    typeof value === "string" &&
    VALID_PRESETS.includes(value as PermissionPreset)
  );
}

/** Build the canonical SWR cache key for a given user address. */
export function preferencesKey(address: string | null): string | null {
  return address ? `user-preferences:${address}` : null;
}

export function usePreferences(address: string | null) {
  return useSWR<UserPreferences>(
    preferencesKey(address),
    async () => {
      if (!address) {
        return DEFAULT_PREFERENCES;
      }
      const res = await authFetch(
        audricWebUrl(`/api/user/preferences?address=${address}`)
      );
      if (!res.ok) {
        return DEFAULT_PREFERENCES;
      }
      const data = await res.json();
      return {
        permissionPreset: isValidPreset(data?.permissionPreset)
          ? data.permissionPreset
          : "balanced",
      };
    },
    {
      // 30s window matches the apps/web endpoint's freshness budget.
      // Within this window, the second consumer mounting on a sibling
      // settings tab serves from cache without re-fetching.
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
    }
  );
}

export type { KeyedMutator } from "swr";
