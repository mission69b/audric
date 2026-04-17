"use client";

import { useCopilotEnabled } from "@/hooks/useFeatureFlags";
import { useCopilotSuggestions } from "@/hooks/useCopilotSuggestions";

interface CopilotPillProps {
  address: string | null;
  jwt: string | null;
  /** When true, pill is hidden — used to suppress while user is mid-flow. */
  hidden?: boolean;
}

/**
 * Slim "N Copilot suggestions waiting" pill that surfaces inside the
 * timeline (Wave C.5). The dashboard already renders the full
 * `CopilotSuggestionsRow` above the chat, but once the user scrolls into a
 * long conversation the row falls off-screen — this pill is a one-tap
 * reminder + scroll-to-top affordance.
 *
 * Renders nothing when:
 *   - COPILOT_ENABLED is false
 *   - no pending suggestions
 *   - explicitly hidden (e.g., chip flow active)
 */
export function CopilotPill({ address, jwt, hidden }: CopilotPillProps) {
  const enabled = useCopilotEnabled();
  const query = useCopilotSuggestions(address, jwt);
  const count = query.data?.suggestions.length ?? 0;

  if (!enabled || hidden || count === 0) return null;

  const onClick = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const label =
    count === 1
      ? "1 Copilot suggestion waiting"
      : `${count} Copilot suggestions waiting`;

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs text-accent hover:bg-accent/10 hover:border-accent/50 transition focus-visible:ring-2 focus-visible:ring-accent/30 outline-none"
        aria-label={`${label} — scroll to dashboard`}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
          {label}
        </span>
        <span className="opacity-60 group-hover:opacity-100 transition">↑</span>
      </button>
    </div>
  );
}
