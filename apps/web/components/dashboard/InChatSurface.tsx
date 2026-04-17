"use client";

import { useEffect, useRef, useState } from "react";
import { useInChatSurface } from "@/hooks/useInChatSurface";
import { CopilotSuggestionCard } from "./CopilotSuggestionCard";

interface InChatSurfaceProps {
  address: string | null;
  jwt: string | null;
  /**
   * Engine session id. Used as the dedup key so we surface the card at
   * most once per session — switching sessions resets the dismissal.
   */
  sessionId: string | null;
}

/**
 * Wave C.6 — surfaces a single Copilot suggestion as the first item in
 * the chat timeline when the user opens a fresh session, but only if
 * the cross-surface suppression on the server allows it (no recent
 * dashboard visit).
 *
 * Hidden when:
 *   - Copilot disabled (hook short-circuits to suggestion=null)
 *   - Server suppressed it (recent dashboard visit)
 *   - User dismissed it for this session
 *   - No pending suggestion to surface
 *
 * We deliberately render the existing CopilotSuggestionCard so the
 * action set, copy, and confirm-page routing stay consistent with the
 * dashboard surface. A wrapper "AUDRIC NOTICED IN CHAT" label is added
 * by the card itself.
 */
export function InChatSurface({ address, jwt, sessionId }: InChatSurfaceProps) {
  const { data } = useInChatSurface(address, jwt);

  // Per-session dismissal. Tracked as a plain boolean (not by sessionId
  // equality) so dismissing while sessionId is still null works correctly —
  // useState(null === null) would mis-evaluate the guard.
  const [dismissed, setDismissed] = useState(false);
  const lastSessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => {
    if (sessionId !== lastSessionIdRef.current) {
      lastSessionIdRef.current = sessionId;
      setDismissed(false);
    }
  }, [sessionId]);

  const suggestion = data?.suggestion ?? null;
  if (!suggestion || dismissed) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute -top-2 -right-2 z-10 h-6 w-6 inline-flex items-center justify-center rounded-full border border-border bg-background text-dim hover:text-foreground hover:border-foreground/40 transition text-sm leading-none shadow-sm"
        aria-label="Dismiss for this conversation"
        title="Dismiss for this conversation"
      >
        ×
      </button>
      <CopilotSuggestionCard
        suggestion={suggestion}
        address={address}
        jwt={jwt}
      />
    </div>
  );
}
