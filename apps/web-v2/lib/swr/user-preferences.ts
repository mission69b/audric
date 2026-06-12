"use client";

/**
 * `usePreferences` — single SWR cache slot for `/api/user/preferences`.
 *
 * Shipped in v0.7c Session 4.7.A as the canonical reader for everything
 * persisted on the user-preferences endpoint.
 *
 * [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] The Safety section
 * (settings → safety, the original sole consumer) was removed with the
 * DeFi cut — its per-op USD-threshold table was inert and DeFi-shaped.
 * The surviving consumer is `ServicesSpendingSection` (settings →
 * services, the B-cap daily limit). `permissionPreset` stays on the
 * shape: the chat route still feeds the preset-derived
 * `permissionConfig` to the engine for per-turn analytics, and the
 * server merge contract is unchanged — there's just no UI writing the
 * preset anymore (everyone effectively keeps their stored/default value).
 *
 * Mutation contract: consumers post partial payloads to the same route.
 * The server merges the partial into the persisted record. The `mutate`
 * returned from this hook accepts an optimistic updater that patches
 * only the affected field; rollback-on-error is built in.
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
  // B-cap: daily MPP Service-consumption ceiling (USD). `null` = the user
  // turned the cap off; `undefined` = unset → server default ($10) applies.
  mppDailyCapUsd?: number | null;
  permissionPreset: PermissionPreset;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  permissionPreset: "balanced",
};

function readMppCap(limits: unknown): number | null | undefined {
  if (limits && typeof limits === "object" && !Array.isArray(limits)) {
    const raw = (limits as Record<string, unknown>).mppDailyCapUsd;
    if (raw === null) {
      return null;
    }
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
  }
  return;
}

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
        mppDailyCapUsd: readMppCap(data?.limits),
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
