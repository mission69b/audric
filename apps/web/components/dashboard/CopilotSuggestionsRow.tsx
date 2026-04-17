"use client";

import { useEffect, useRef } from "react";
import { useCopilotSuggestions } from "@/hooks/useCopilotSuggestions";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";
import { CopilotSuggestionCard } from "./CopilotSuggestionCard";

interface CopilotSuggestionsRowProps {
  address: string | null;
  jwt: string | null;
}

// Fire-and-forget ping that records the user opened the dashboard. Used by
// the in-chat surface to suppress the same suggestion within 24h (plan §7).
// Pings at most once per mount — the suggestion query already polls separately.
function useDashboardPing(address: string | null, jwt: string | null, enabled: boolean) {
  const pingedRef = useRef(false);
  useEffect(() => {
    if (!enabled || !address || !jwt || pingedRef.current) return;
    pingedRef.current = true;
    void fetch("/api/copilot/dashboard-ping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zklogin-jwt": jwt,
      },
      body: JSON.stringify({ address }),
    }).catch(() => {
      // best-effort — swallow errors
    });
  }, [address, jwt, enabled]);
}

/**
 * Vertical stack of pending Copilot suggestions on the dashboard.
 *
 * Renders nothing when:
 *   - COPILOT_ENABLED is false (the hook returns enabled=false → no fetch)
 *   - the user has no pending suggestions
 *   - auth is missing
 *
 * Mobile + desktop both stack vertically (plan §4 — vertical stack chosen
 * over horizontal carousel for accessibility and clarity).
 */
export function CopilotSuggestionsRow({ address, jwt }: CopilotSuggestionsRowProps) {
  const enabled = useCopilotEnabled();
  useDashboardPing(address, jwt, enabled);

  const query = useCopilotSuggestions(address, jwt);
  const suggestions = query.data?.suggestions ?? [];

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <CopilotSuggestionCard
          key={`${s.kind}:${s.id}`}
          suggestion={s}
          address={address}
          jwt={jwt}
        />
      ))}
    </div>
  );
}
