"use client";

import { useQuery } from "@tanstack/react-query";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";
import type { CopilotSuggestion } from "@/hooks/useCopilotSuggestions";

interface InChatSurfaceResponse {
  suggestion: CopilotSuggestion | null;
  suppressed?: "recent_dashboard";
}

/**
 * Wave C.6 — fetches at most one Copilot suggestion to surface inside the
 * chat timeline at session open. Cross-surface suppression is enforced
 * server-side (recent dashboard visit → null).
 *
 * Lazy: only runs when Copilot is enabled and we have credentials.
 * Cache: 60s stale, no refetch on focus — once we've surfaced for a session
 * we don't want it flickering in/out.
 */
export function useInChatSurface(
  address: string | null,
  jwt: string | null,
) {
  const enabled = useCopilotEnabled();

  return useQuery<InChatSurfaceResponse>({
    queryKey: ["copilot-in-chat-surface", address],
    enabled: enabled && Boolean(address && jwt),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!address || !jwt) return { suggestion: null };
      const res = await fetch(
        `/api/copilot/in-chat-surface?address=${address}`,
        { headers: { "x-zklogin-jwt": jwt } },
      );
      if (!res.ok) return { suggestion: null };
      return res.json();
    },
  });
}
