"use client";

/**
 * ChatGate — onboarding claim gate that sits above `<ChatShell>`.
 *
 * Mirrors the apps/web `dashboard-content.tsx` gate that the web-v2
 * canary has been silently bypassing since Phase 3 — a P0 onboarding
 * gap (newly-signed-up users land directly on the chat composer
 * without ever being asked to claim a handle). Closes that gap.
 *
 * State machine (identical to legacy dashboard-content.tsx):
 *
 *   userStatus.loading        → render `<ChatShell />` (no flash; the
 *                                empty state has its own loading UX)
 *   username !== null         → render `<ChatShell />`
 *   skipped via localStorage  → render `<ChatShell />`
 *   optimisticallyClaimed     → render `<ChatShell />` (covers the
 *                                userStatus refetch round-trip; the
 *                                gate stays hidden once the canonical
 *                                username flips non-null)
 *   otherwise                 → render the centered claim gate
 *
 * Skip is preserved (legacy behavior). The settings safety-valve
 * (`<UsernameClaimModal>` in `<PassportSection>`) is the path back if
 * the user changes their mind.
 *
 * Traceability: SPEC 10 D2 + RUNBOOK_v07c_phase_6_cutover.md §4.7.D.
 */

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { UsernameClaimGate } from "@/components/settings/username-claim-gate";
import { useUserStatus } from "@/hooks/use-user-status";
import {
  isUsernameSkipped,
  setUsernameSkipped as persistUsernameSkipped,
} from "@/lib/identity/username-skip";
import { decodeJwtClaim } from "@/lib/jwt-client";
import { ChatShell } from "./shell";

export function ChatGate() {
  const { address, session, status: authStatus } = useZkLogin();
  const userStatus = useUserStatus(address, session?.jwt);

  // Lazy initializer reads from localStorage exactly once on mount.
  // Re-renders use the in-memory `skipped` state for parity with the
  // dashboard-content.tsx pattern (avoids re-reading storage on every
  // render). The `address` may be null on the very first render; the
  // helper handles that and returns false.
  const [skipped, setSkipped] = useState<boolean>(() =>
    isUsernameSkipped(address)
  );

  // Optimistic flag: lets the gate disappear instantly on a successful
  // Continue click before userStatus refetch lands. Once userStatus
  // resolves with `username !== null` the structural check takes over,
  // and the optimistic flag becomes harmless dead state.
  const [optimisticallyClaimed, setOptimisticallyClaimed] = useState(false);

  const handleClaimed = useCallback(() => {
    setOptimisticallyClaimed(true);
    userStatus.refetch().catch(() => {
      // Refetch is best-effort — the userStatus cache stays stale on
      // error and the optimistic flag covers the UX. The next focused
      // surface will trigger a fresh read.
    });
  }, [userStatus]);

  const handleSkipped = useCallback(() => {
    if (!address) {
      return;
    }
    persistUsernameSkipped(address);
    setSkipped(true);
  }, [address]);

  // Not authenticated → no gate (the audric-chat client component
  // owns the pre-auth splash; this only ever mounts inside the
  // authenticated chat shell, but defensive null-guard.
  if (authStatus !== "authenticated" || !(address && session)) {
    return <ChatShell />;
  }

  // Prevent the empty-state ↔ gate flash. While userStatus is loading
  // on first signed-in render, neither the gate nor the empty state
  // can render correctly — picking either would flash the wrong
  // surface for ~100-300ms before the data arrives. Match the legacy
  // dashboard-content.tsx pattern (centered spinner) so the picker (or
  // ChatShell empty state) materialises ONCE without a stale-state
  // flash.
  if (userStatus.loading) {
    return (
      <div
        className="flex h-dvh w-full flex-1 items-center justify-center bg-background"
        data-testid="chat-claim-gate-loading"
      >
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const shouldShowGate =
    userStatus.username === null && !skipped && !optimisticallyClaimed;

  if (!shouldShowGate) {
    return <ChatShell />;
  }

  const googleName = decodeJwtClaim(session.jwt, "name") ?? null;
  const googleEmail = decodeJwtClaim(session.jwt, "email") ?? null;

  // Full-bleed centered gate that replaces the chat surface. Matches
  // the legacy dashboard-content layout (max-w-md, top-aligned with
  // generous pt-12 so the picker doesn't drift mid-screen on tall
  // viewports).
  return (
    <div
      className="flex h-dvh w-full flex-1 flex-col items-center overflow-y-auto bg-background px-4 pt-12 pb-8 sm:px-6"
      data-testid="chat-claim-gate"
    >
      <div className="mt-8 w-full max-w-md">
        <UsernameClaimGate
          address={address}
          googleEmail={googleEmail}
          googleName={googleName}
          jwt={session.jwt}
          onClaimed={handleClaimed}
          onSkipped={handleSkipped}
        />
      </div>
    </div>
  );
}
