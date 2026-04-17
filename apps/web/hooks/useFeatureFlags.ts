"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getClientFeatureFlags,
  type FeatureFlags,
} from "@/lib/feature-flags";

/**
 * Reads feature flags. Falls back to build-time NEXT_PUBLIC_* values immediately
 * (for first paint without flicker), then refreshes against `/api/feature-flags`
 * to catch any drift between client-bundle and server config.
 *
 * Refreshes on a 60s stale window — flags are static for the deploy lifetime.
 */
export function useFeatureFlags(): FeatureFlags {
  const initial = getClientFeatureFlags();

  const query = useQuery<FeatureFlags>({
    queryKey: ["feature-flags"],
    initialData: initial,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/feature-flags");
      if (!res.ok) return initial;
      return res.json();
    },
  });

  return query.data ?? initial;
}

/**
 * Convenience: returns true iff Audric Copilot is enabled.
 * Use to gate the dashboard row, in-chat surface, settings tab, etc.
 *
 * Example:
 *   const copilotEnabled = useCopilotEnabled();
 *   if (!copilotEnabled) return null;
 */
export function useCopilotEnabled(): boolean {
  const flags = useFeatureFlags();
  return flags.copilot.enabled;
}
