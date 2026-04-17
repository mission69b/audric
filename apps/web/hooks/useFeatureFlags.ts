"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getClientFeatureFlags,
  type FeatureFlags,
} from "@/lib/feature-flags";

/**
 * Reads feature flags from the server. The server endpoint (/api/feature-flags)
 * is the canonical source. NEXT_PUBLIC_* values are used ONLY as placeholderData
 * for first paint to avoid flicker — they don't mark the query as fresh, so the
 * hook always issues a fetch on mount to catch any drift between client-bundle
 * and server config (e.g. when COPILOT_ENABLED is set on Vercel but the build
 * shipped before NEXT_PUBLIC_COPILOT_ENABLED was added).
 *
 * Refreshes on a 60s stale window once the server has confirmed.
 */
export function useFeatureFlags(): FeatureFlags {
  const initial = getClientFeatureFlags();

  const query = useQuery<FeatureFlags>({
    queryKey: ["feature-flags"],
    placeholderData: initial,
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
