"use client";

/**
 * `usePreferences` — single SWR cache slot for `/api/user/preferences`.
 *
 * Shipped in v0.7c Session 4.7.A as the canonical reader for everything
 * persisted on the user-preferences endpoint. Two consumers today share
 * this cache: `useContacts` (settings → contacts) and `SafetySection`
 * (settings → safety). When a user navigates between those tabs, only
 * the FIRST one fires a network request — the second renders from the
 * shared cache slot. Same wire path as before, half the traffic.
 *
 * Replaces the raw `useState/useEffect/useRef` patterns previously used
 * by `useContacts` (in-flight dedup via ref) and `safety-section`
 * (manual loading state). SWR's `dedupingInterval` provides built-in
 * dedup for free.
 *
 * Mutation contract: both `addContact` (use-contacts) and `updatePreset`
 * (safety-section) post to the SAME route with PARTIAL payloads. The
 * server merges the partial into the persisted record. The `mutate`
 * returned from this hook accepts an optimistic updater that patches
 * only the affected field; rollback-on-error is built in.
 */

import useSWR from "swr";
import { audricWebUrl } from "@/lib/audric-web-url";
import { authFetch } from "@/lib/auth-fetch";

export interface Contact {
  addedAt?: string | null;
  address: string;
  audricUsername?: string | null;
  identifier?: string;
  name: string;
  resolvedAddress?: string;
  source?: string | null;
}

export type PermissionPreset = "conservative" | "balanced" | "aggressive";

export interface UserPreferences {
  contacts: Contact[];
  permissionPreset: PermissionPreset;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  contacts: [],
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
        contacts: Array.isArray(data?.contacts)
          ? (data.contacts as Contact[])
          : [],
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
