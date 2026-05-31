"use client";

import { useChat } from "@ai-sdk/react";
import type { SupportedAsset } from "@t2000/sdk";
import {
  DefaultChatTransport,
  generateId,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ReasoningUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import { Copy, Loader2, Pencil, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  BundlePermissionCard,
  type BundlePermissionCardStep,
  PermissionCard,
  type PermissionCardModifiableField,
} from "@/components/audric/permission-card";
import { ToolResultRouter } from "@/components/audric/tool-result-router";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ChipBar } from "@/components/chat/chip-bar";
import { EmptyState } from "@/components/chat/empty-state";
import {
  MessageVoteThumbs,
  type VoteState,
} from "@/components/chat/message-vote-thumbs";
import { getChatHistoryPaginationKey } from "@/components/chat/sidebar-history";
import { VisibilityToggle } from "@/components/chat/visibility-toggle";
import { UsernameClaimGate } from "@/components/settings/username-claim-gate";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { useUserStatus } from "@/hooks/use-user-status";
import {
  type AudricBundleMarkerData,
  isBundleSpent,
} from "@/lib/audric/bundle-status";
import { redactAddressesInText } from "@/lib/audric/log-redact";
import { getMessageText } from "@/lib/audric/message-text";
import { subscribeNewChat } from "@/lib/audric/new-chat-event";
import {
  type SponsoredTxBundleStep,
  type SponsoredTxRequest,
  type SponsoredTxResult,
  sponsoredTx,
} from "@/lib/audric/sponsored-tx";
import { sanitizeStreamErrorMessage } from "@/lib/audric/stream-errors";
import { authFetch } from "@/lib/auth-fetch";
import {
  isUsernameSkipped,
  setUsernameSkipped as persistUsernameSkipped,
} from "@/lib/identity/username-skip";
import { decodeJwtClaim } from "@/lib/jwt-client";
import { cn } from "@/lib/utils";
import type { ZkLoginSession } from "@/lib/zklogin";

// Bundle marker shape + `isBundleSpent` extracted to
// `lib/audric/bundle-status.ts` 2026-05-24 (SPEC_AI_SDK_HARDENING P5.1)
// so the spent-check can be unit-tested in isolation. Re-exported as
// a named import below.

/**
 * Audric chat — client component.
 *
 * Phase 5c (S.181) — Timeline rendering via AI SDK v6 native primitives.
 * The legacy `BlockRouter` + 13 block types was structurally obsolete
 * because `UIMessage.parts` IS the ordered timeline. This client now uses
 * four template-shipped AI Elements end-to-end:
 *   - `<Conversation>` + `<ConversationContent>` — auto-stick-to-bottom
 *     scroll (use-stick-to-bottom).
 *   - `<Message from={role}>` + `<MessageContent>` — chat-bubble layout
 *     with role-based alignment (user → right, assistant → left).
 *   - `<MessageResponse>` (Streamdown) — markdown rendering for text
 *     parts (links, code, lists, math, mermaid).
 *   - `<Reasoning>` + `<ReasoningTrigger>` + `<ReasoningContent>` — the
 *     extended-thinking accordion ("Thinking..." while streaming →
 *     "Thought for N seconds" when done; auto-close 1s after stream
 *     ends). Streaming gate: `status === "streaming"` AND part is on
 *     the trailing message AND `part.state !== "done"`.
 *
 * Phase 3 Day 3c (S.175): replaced the JWT-textarea smoke surface with
 * the real zkLogin Google OAuth flow via `useZkLogin`. The chat panel
 * mounts only after the user is `authenticated` (full ZkLoginSession
 * present in localStorage) so the sponsored-tx flow has everything it
 * needs (ephemeral keypair + proof + maxEpoch) to sign on the user's
 * behalf — non-custodial.
 *
 * Day 3c also wires AI SDK's native HITL contract:
 *   - The chat route's `tool-input-available` parts carry `toolMetadata`
 *     with `{ description, modifiableFields, attemptId }` for any
 *     confirm-tier tool (today: `save_deposit`).
 *   - When AI SDK pauses on `needsApproval=true`, the assembled
 *     `ToolUIPart` enters state `'approval-requested'`. This component
 *     renders `<PermissionCard>` for those parts.
 *   - "Approve" runs `sponsoredSave` (prepare → sign locally → execute)
 *     then calls `addToolApprovalResponse({approved: true})` followed
 *     by `addToolOutput({tool, toolCallId, output})`. The
 *     `sendAutomaticallyWhen` hook then auto-fires the next turn so
 *     the LLM narrates the save without the user typing another
 *     message.
 *   - "Deny" calls `addToolApprovalResponse({approved: false, reason})`.
 *     AI SDK surfaces a `tool-output-denied` chunk to the model on the
 *     next turn so the LLM gracefully narrates the rejection.
 */
/**
 * [v0.7e Persistent Chats (S.247)] Hydration props.
 *
 * Pre-S.247 the chat surface was ephemeral — every `/chat` visit started a
 * fresh session and no prior messages ever loaded. The new `/chat/[id]`
 * route hydrates prior turns server-side and passes them in as
 * `initialMessages` so `useChat({ id, messages })` resumes the conversation
 * with the LLM holding full context. Both props are optional — the
 * `/chat` (new chat) entry passes nothing and `useChat` generates a fresh
 * id at mount time.
 */
export type AudricChatClientProps = {
  chatId?: string;
  initialMessages?: UIMessage[];
  /**
   * Initial visibility for the visibility toggle. Only consulted when
   * `chatId` is defined (a new/unsaved chat has nothing to toggle).
   * Defaults to `private` per `Chat.visibility` schema default.
   */
  initialVisibility?: "private" | "public";
};

export function AudricChatClient({
  chatId,
  initialMessages,
  initialVisibility = "private",
}: AudricChatClientProps = {}) {
  const { status, session } = useZkLogin();
  const router = useRouter();

  // [F2 — 2026-05-31] Mount gate. zkLogin session lives in localStorage
  // and `useZkLogin` resolves it client-side only, so SSR (no session)
  // and the first client render (session present) would otherwise emit
  // different HTML → React hydration mismatch on the `audric.` splash.
  // Forcing the splash until `mounted` makes the first client render
  // match the server; the authed branch evaluates post-mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Unauthenticated / expired visitors get bounced to the marketing
  // homepage, which owns the sign-in entry point. The old inline
  // "Splash-B" marketing hero on /chat was the wrong UX — it duplicated
  // the homepage hero on a route that should be authed-only. Mirrors
  // `auth-guard.tsx` (used by /settings). The homepage redirects the
  // reverse case (authenticated → /chat), so the two never loop.
  const isUnauth = status === "unauthenticated" || status === "expired";
  useEffect(() => {
    if (isUnauth) {
      router.replace("/");
    }
  }, [isUnauth, router]);

  // Any non-authenticated state — initial localStorage hydration, the
  // Google OAuth redirect, or the brief moment while an unauth/expired
  // visitor is bounced home — shows the centered `audric.` wordmark +
  // spinner. No marketing copy, no sign-in button: sign-in lives on `/`.
  if (!mounted || status !== "authenticated" || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3">
        <p className="font-medium font-serif text-[36px] text-foreground tracking-[-0.02em]">
          audric.
        </p>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AuthenticatedChat
      chatId={chatId}
      initialMessages={initialMessages}
      initialVisibility={initialVisibility}
      session={session}
    />
  );
}

/**
 * Authenticated chat — sits behind the username-claim gate.
 *
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY A.4 / S.198 — 2026-05-20]
 *
 * Pre-A.4 web-v2 dropped newly-signed-up users directly onto the chat
 * composer without ever asking them to claim a handle. That's a P0
 * onboarding gap — `/{username}` profile routing, contact lookup, and
 * payment-link surfaces all assume a claimed username. The legacy
 * surface (`apps/web/components/identity/UsernameClaimGate.tsx`)
 * gates `<DashboardContent>`; we mirror the same state machine here
 * for the audric-v2 chat surface.
 *
 * State machine (identical to legacy + `(chat)/layout.tsx`'s
 * `<ChatGate>` mount):
 *
 *   userStatus.loading        → centered spinner (no flash)
 *   username !== null         → render `<AudricChatPanel />`
 *   skipped via localStorage  → render `<AudricChatPanel />`
 *   optimisticallyClaimed     → render `<AudricChatPanel />` (covers
 *                                the userStatus refetch round-trip)
 *   otherwise                 → render the centered claim gate
 *
 * Skip is preserved (legacy behavior). The settings safety-valve
 * (`<UsernameClaimModal>` in Passport settings) is the path back if
 * the user changes their mind.
 *
 * Why this lives here and not in `<ChatGate>` from
 * `components/chat/chat-gate.tsx`: that component wraps the
 * template's `<ChatShell />` (mounted from `(chat)/layout.tsx`); this
 * page lives OUTSIDE the `(chat)` route group (see `app/chat/page.tsx`
 * comment header) so it never inherits that layout's gate. The
 * `(chat)/` route group deletes in Session 9a; this inline gate is the
 * cutover-safe home.
 */
function AuthenticatedChat({
  chatId,
  initialMessages,
  initialVisibility,
  session,
}: {
  chatId?: string;
  initialMessages?: UIMessage[];
  initialVisibility: "private" | "public";
  session: ZkLoginSession;
}) {
  // [P1-C fix] Track the promoted chat id so the VisibilityToggle
  // surfaces AFTER the URL flip too — pre-P1-C the toggle only
  // rendered when the `chatId` prop was defined, which meant freshly-
  // started chats had no share/visibility affordance until the user
  // navigated via the sidebar (the URL flips via `replaceState` from
  // inside the child panel, which doesn't re-mount the parent).
  //
  // The child calls `onChatPromoted(effectiveChatId)` from inside its
  // URL-promote effect; the parent stores it and the toggle reads from
  // either the prop (resume path) or the promoted id (fresh-chat path).
  const [promotedChatId, setPromotedChatId] = useState<string | null>(null);
  const toggleChatId = chatId ?? promotedChatId;
  return (
    <AuthenticatedChatInner
      chatId={chatId}
      initialMessages={initialMessages}
      initialVisibility={initialVisibility}
      onChatPromoted={chatId === undefined ? setPromotedChatId : undefined}
      session={session}
      toggleChatId={toggleChatId}
    />
  );
}

function AuthenticatedChatInner({
  chatId,
  initialMessages,
  initialVisibility,
  session,
  toggleChatId,
  onChatPromoted,
}: {
  chatId?: string;
  initialMessages?: UIMessage[];
  initialVisibility: "private" | "public";
  session: ZkLoginSession;
  toggleChatId: string | null;
  onChatPromoted?: (id: string) => void;
}) {
  const userStatus = useUserStatus(session.address, session.jwt);

  // Lazy initializer reads from localStorage exactly once on mount.
  // Subsequent renders use the in-memory `skipped` state (matches the
  // dashboard-content.tsx + ChatGate pattern; avoids re-reading
  // storage on every render).
  const [skipped, setSkipped] = useState<boolean>(() =>
    isUsernameSkipped(session.address)
  );

  // Optimistic flag — lets the gate disappear instantly on a
  // successful Continue click before userStatus refetch lands. Once
  // userStatus resolves with `username !== null` the structural check
  // takes over, and the optimistic flag becomes harmless dead state.
  const [optimisticallyClaimed, setOptimisticallyClaimed] = useState(false);

  // [S.205 — 2026-05-20] "New chat" nonce. Bumps when the sidebar
  // dispatches `audric:new-chat`. Woven into AudricChatPanel's mount
  // key so the panel re-mounts → `useChat()` resets messages to []
  // → empty-state hero re-renders. Lives at AuthenticatedChat-scope
  // (not deeper) so the panel itself doesn't have to know about the
  // event — it just re-mounts when the key changes.
  const [chatNonce, setChatNonce] = useState(0);
  useEffect(() => subscribeNewChat(() => setChatNonce((n) => n + 1)), []);

  const handleClaimed = useCallback(() => {
    setOptimisticallyClaimed(true);
    userStatus.refetch().catch(() => {
      // Refetch is best-effort; optimistic flag covers the UX. The
      // next focused surface will trigger a fresh read.
    });
  }, [userStatus]);

  const handleSkipped = useCallback(() => {
    persistUsernameSkipped(session.address);
    setSkipped(true);
  }, [session.address]);

  // Prevent the empty-state ↔ gate flash. Match the legacy pattern
  // (centered spinner) so the chat surface materialises ONCE without
  // a stale-state flash on first signed-in render.
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
    userStatus.username === null && !(skipped || optimisticallyClaimed);

  if (shouldShowGate) {
    const googleName = decodeJwtClaim(session.jwt, "name") ?? null;
    const googleEmail = decodeJwtClaim(session.jwt, "email") ?? null;
    return (
      <div
        className="flex h-dvh w-full flex-1 flex-col items-center overflow-y-auto bg-background px-4 pt-12 pb-8 sm:px-6"
        data-testid="chat-claim-gate"
      >
        <div className="mt-8 w-full max-w-md">
          <UsernameClaimGate
            address={session.address}
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

  // [S.209 — 2026-05-20] Sidebar chrome moved into the authenticated
  // branch only. Pre-S.209 the SidebarProvider + AppSidebar lived in
  // `/chat/layout.tsx` and rendered for EVERY visitor — including
  // pre-auth and expired-session users. That caused the founder-flagged
  // bug where the splash hero showed alongside an empty sidebar + 401
  // errors from SidebarUserNav's `useUserStatus()` hitting
  // `/api/user/status` with a stale JWT. With chrome now gated on
  // `authenticated`, unauth visitors see a chrome-less splash (the
  // loading + pre-auth branches above) and no API calls fire until
  // a verified-fresh session lands.
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex h-dvh flex-col bg-background text-foreground">
          {/* [v0.7e Persistent Chats Phase 4 / S.247 + P1-C] Header is
              ALWAYS visible (mobile + desktop). Left: sidebar trigger
              (mobile only — desktop sidebar is already pinned via
              SidebarProvider). Right: visibility toggle + copy-link
              when we have a committed chat to share. `toggleChatId`
              resolves to (a) the `chatId` prop for the resume path
              (/chat/[id]) OR (b) the parent-tracked `promotedChatId`
              for the fresh-chat path after URL promote. */}
          <header className="flex h-12 items-center justify-between px-3">
            <SidebarTrigger className="text-foreground/60 hover:text-foreground md:hidden" />
            <div className="ml-auto">
              {toggleChatId && (
                <VisibilityToggle
                  chatId={toggleChatId}
                  initialVisibility={initialVisibility}
                />
              )}
            </div>
          </header>
          <AudricChatPanel
            chatId={chatId}
            initialMessages={initialMessages}
            key={`${session.address}-${chatId ?? "new"}-${chatNonce}`}
            onChatPromoted={onChatPromoted}
            session={session}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Inner chat panel — only ever mounted once the session is hydrated.
 *
 * `key={session.address}` re-mounts on user switch so the `useChat`
 * instance gets a clean slate per session (also sidesteps the v6
 * non-reactive-transport limitation we hit in Day 2c++).
 */
function AudricChatPanel({
  chatId,
  initialMessages,
  onChatPromoted,
  session,
}: {
  chatId?: string;
  initialMessages?: UIMessage[];
  /**
   * [P1-C] Callback fired ONCE when the panel promotes a fresh-chat
   * URL (`/chat` → `/chat/[id]`). Lets the parent surface the
   * VisibilityToggle for newly-committed chats without having to
   * re-mount this panel (which would blow away `useChat` state).
   */
  onChatPromoted?: (id: string) => void;
  session: ZkLoginSession;
}) {
  const [input, setInput] = useState<string>("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { "x-zklogin-jwt": session.jwt },
      }),
    [session.jwt]
  );

  // [v0.7e Persistent Chats Phase 5 / S.247] Stable per-mount id. When
  // the prop `chatId` is undefined (new-chat path at `/chat`), we
  // generate one client-side so the server's `body.id ?? generateId()`
  // ladder picks up OUR id (not a server-only one the client would
  // never learn). When `chatId` IS defined (resume at `/chat/[id]`),
  // we use it verbatim. `useMemo` keeps the value stable across
  // re-renders within the same mount — re-mounting (via the parent's
  // `key={chatId ?? "new"}-${chatNonce}`) is the only way to rotate
  // to a fresh id.
  const effectiveChatId = useMemo(() => chatId ?? generateId(), [chatId]);

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    regenerate,
    addToolApprovalResponse,
    addToolOutput,
  } = useChat({
    // [v0.7e Persistent Chats (S.247)] Stable `id` per chat enables
    // `useChat` to thread it through the request body — `/api/chat`
    // reads `body.id` as `chatId` for persistence. Resume path
    // (`/chat/[id]`) hydrates prior turns via `messages` so the
    // assembled context exactly matches what the LLM saw last time.
    id: effectiveChatId,
    messages: initialMessages,
    transport,
    // [U1 — 2026-05-31] Throttle render updates to ~100ms (vercel/chatbot
    // parity). Without this every streamed token re-renders the whole
    // messages list + re-parses every markdown block, which (combined
    // with the former reasoning-hoist bug) produced the jerky, jumping
    // timeline the founder reported. 100ms is imperceptible for text yet
    // collapses the per-token render storm.
    experimental_throttle: 100,
    // [SPEC_AUDRIC_STREAM_RESUME Phase 2 — 2026-05-24] Enable stream
    // resume on mount. The hook fires GET to
    // `${api}/${id}/stream` (default `/api/chat/[id]/stream` — matches
    // our route) and, if the server returns 200 SSE, reconnects to a
    // live in-flight stream. 204 means no active stream → no-op. Safe
    // for new-chat mounts too: the route's ownership-gated query
    // returns 204 for chats that don't exist yet.
    resume: true,
    // Auto-fire the next turn once a tool-call has been answered
    // (output OR approval response). Without this the user would have
    // to type a follow-up message to get the LLM's narration of the
    // save result. AI SDK ships the canonical predicate.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // [SPEC_AI_SDK_HARDENING P6.2 — 2026-05-24] Observability hook for
    // stream-level errors. The banner UX is unchanged (rendered via
    // `useChat.error` further down) — this callback is purely a
    // structured logging seam so we can swap in Sentry/captureError
    // without touching the component. Logged shape mirrors other
    // client-side non-fatal error handlers in this file (vote
    // hydration, stop API call).
    //
    // Why banner-only (no toast): finance app — errors must be seen,
    // not auto-dismissed. P5.1 (Edit) + P5.4 (Regenerate) provide the
    // recovery paths, so the error surface doesn't need to be loud.
    // Revisit if telemetry shows users missing the banner (S.296-style
    // "is the surface noticed?" question — answer with data).
    onError: (error: Error) => {
      console.error(
        "[audric-chat] useChat error (non-fatal — banner shown):",
        error.message
      );
    },
  });

  // [SPEC_AUDRIC_STREAM_RESUME Phase 2 — 2026-05-24] Explicit-stop
  // handler. In a resumable-stream setup, `useChat.stop()` alone is a
  // DISCONNECT signal — it closes the local SSE but leaves the
  // server-side producer running until natural completion. To
  // actually stop the conversation, we also fire POST
  // `/api/chat/[id]/stop` which clears `Chat.activeStreamId` so the
  // next mount's resume probe returns 204 (no reconnect attempted)
  // per the AI SDK doc's "no auto-reconnect after explicit stop"
  // guidance. The server-side producer still runs to natural
  // completion in Phase 2 (no AbortController plumbing yet); the
  // natural-completion `saveMessages` persists the full message.
  // User-visible behavior: stop visually halts the tab's streaming
  // immediately and reload doesn't auto-resume — Phase 3 will close
  // the producer-keeps-running gap once we wire the AbortController.
  const handleStop = useCallback(() => {
    stop();
    // Fire-and-forget — failure is non-fatal (the stop button's main
    // job is `stop()` above, which always succeeds locally).
    fetch(`/api/chat/${effectiveChatId}/stop`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zklogin-jwt": session.jwt,
      },
      // No body needed — server reads current activeStreamId from DB.
      // Without `body.activeStreamId` the stale-stop guard is skipped,
      // which is the conservative default per the route's JSDoc.
      body: JSON.stringify({}),
    }).catch((err) => {
      console.error(
        "[audric-chat] stop API call failed (non-fatal):",
        err instanceof Error ? err.message : String(err)
      );
    });
  }, [stop, effectiveChatId, session.jwt]);

  // [SPEC_AI_SDK_HARDENING P5.3 — 2026-05-24] Hydrate prior votes on
  // chat load. Pre-P5.3 every reload lost the thumbs-up/down state
  // because `MessageVoteThumbs` only kept a local `useState`. We
  // fetch the persisted `Vote` rows from `GET /api/vote` ONCE per
  // chat mount and pass each row down as `initialVote`. Single
  // batch fetch (one network call per chat) avoids N+1 per-message
  // fetches. Degrades open — failure leaves all thumbs as null
  // (same behavior as pre-P5.3).
  //
  // Triggered when `chatId` is committed (skips the unsaved new-chat
  // path because there's no chat row to query yet). Refetch on
  // chatId change covers the click-from-sidebar case.
  const [votesByMessageId, setVotesByMessageId] = useState<
    Map<string, VoteState>
  >(new Map());
  useEffect(() => {
    if (!chatId) {
      setVotesByMessageId(new Map());
      return;
    }
    let cancelled = false;
    authFetch(`/api/vote?chatId=${encodeURIComponent(chatId)}`)
      .then(async (res) => {
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as Array<{
          chatId: string;
          messageId: string;
          isUpvoted: boolean;
        }>;
      })
      .then((votes) => {
        if (!votes || cancelled) {
          return;
        }
        const next = new Map<string, VoteState>();
        for (const v of votes) {
          next.set(v.messageId, v.isUpvoted ? "up" : "down");
        }
        setVotesByMessageId(next);
      })
      .catch((err) => {
        console.error(
          "[audric-chat] vote hydration failed (non-fatal):",
          err instanceof Error ? err.message : String(err)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // [SPEC_AI_SDK_HARDENING P5.2 — 2026-05-24] Copy a message's text
  // to clipboard. Skips reasoning / tool / bundle parts (see
  // `getMessageText` JSDoc for why).
  const handleCopy = useCallback(async (message: UIMessage) => {
    const text = getMessageText(message);
    if (!text) {
      toast.error("Nothing to copy yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy. Try selecting the text manually.");
    }
  }, []);

  // [SPEC_AI_SDK_HARDENING P5.4 — 2026-05-24] Regenerate the LAST
  // assistant message. `useChat.regenerate()` without a `messageId`
  // arg regenerates the trailing assistant turn — which is the only
  // turn we expose a regen button on (older assistant rows would
  // require `regenerate({ messageId })` and truncation semantics,
  // which is Phase 5.1 / Edit territory).
  const handleRegenerate = useCallback(() => {
    regenerate().catch((err) => {
      console.error(
        "[audric-chat] regenerate failed:",
        err instanceof Error ? err.message : String(err)
      );
      toast.error("Couldn't regenerate. Please try again.");
    });
  }, [regenerate]);

  // [SPEC_AI_SDK_HARDENING P5.1 — 2026-05-24] Edit + re-send user
  // messages. Click Edit on a past user bubble → swap it for an
  // inline textarea pre-filled with the original text → Save:
  //   1. `setMessages(messages.slice(0, idx))` trims the local
  //      conversation to the messages BEFORE the edit point. AI
  //      SDK clears the trailing state (any in-flight pending
  //      approval, the original message itself, every subsequent
  //      turn).
  //   2. `sendMessage({ text: newText })` appends the new user
  //      message and fires `/api/chat`.
  //   3. Server detects `incoming.length - 1 < dbCount` →
  //      `truncateMessagesAfter(chatId, anchorId)` deletes the
  //      orphan rows from before the edit (route handler at
  //      `/api/chat/route.ts` lines 488+).
  //   4. The new assistant response replaces the truncated branch.
  // Vote rows cascade-delete with their parent Message via the
  // Prisma `onDelete: Cascade` FK in `prisma/schema.prisma`.
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  const beginEdit = useCallback((message: UIMessage) => {
    setEditingMessageId(message.id);
    setEditingDraft(getMessageText(message));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingDraft("");
  }, []);

  const saveEdit = useCallback(
    (messageId: string) => {
      const text = editingDraft.trim();
      if (!text) {
        toast.error("Message can't be empty");
        return;
      }
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) {
        toast.error("Couldn't find that message");
        return;
      }
      setMessages(messages.slice(0, idx));
      sendMessage({ text }).catch((err) => {
        console.error(
          "[audric-chat] edit + re-send failed:",
          err instanceof Error ? err.message : String(err)
        );
        toast.error("Couldn't send the edit. Please try again.");
      });
      setEditingMessageId(null);
      setEditingDraft("");
    },
    [editingDraft, messages, sendMessage, setMessages]
  );

  // [v0.7e Persistent Chats Phase 5 / S.247] Promote a new chat to a
  // permalink URL once the first message has landed. Uses
  // `window.history.replaceState` (not `router.replace`) because
  // Next 16's app-router segment change from `/chat` → `/chat/[id]`
  // WOULD re-mount the page and blow away the in-flight `useChat`
  // state — replaceState updates the address bar without notifying
  // the router. The route group `/chat/[id]/page.tsx` exists for
  // cold reload + click-from-sidebar, this effect is for the
  // "started fresh and now want a refresh to land me back here" path.
  // Guarded on `chatId === undefined` so we never re-promote a chat
  // that was already opened via `/chat/[id]`.
  useEffect(() => {
    if (
      chatId === undefined &&
      messages.length > 0 &&
      typeof window !== "undefined" &&
      window.location.pathname === "/chat"
    ) {
      window.history.replaceState({}, "", `/chat/${effectiveChatId}`);
      // [P1-C] Notify parent so the VisibilityToggle can surface for
      // the now-committed chat. Parent stores the id in state and
      // passes it back via `toggleChatId` — no re-mount required.
      onChatPromoted?.(effectiveChatId);
    }
  }, [chatId, effectiveChatId, messages.length, onChatPromoted]);

  // [S.248-followup / Smoke #1 + Smoke 2026-05-22 V2] Sidebar history
  // SWR cache invalidation.
  //
  // V1 (first attempt) only mutated on `streaming → ready`. That misses
  // the case where the stream ERRORS (tool_use Anthropic 400 — the
  // recurring resume-turn bug). On error, status goes
  // `streaming → error`, never to `ready`, so the mutate never fires
  // and the sidebar stays stale even though the input messages were
  // persisted via the abort-safe save path (see route.ts onFinish).
  //
  // V2 fix: also mutate on `streaming → error`. AND fire an additional
  // mutate immediately on URL-promote — that's the earliest signal a
  // new chat exists. The server's `onFinish` typically lands the
  // saveMessages upsert within 200-500ms of the stream completing, so
  // a 600ms delayed mutate on URL-promote catches the lazy-upsert in
  // most cases. Two-shot mutate (early + on terminal status) ensures
  // the sidebar refreshes whether the stream succeeded, errored, or
  // the user is on a slow network.
  //
  // **Cost analysis:** 1-2 extra GET /api/history calls per new chat.
  // The endpoint is cheap (Prisma query with a `take: 20` limit on an
  // indexed userSuiAddress + ordered by updatedAt) — under 100ms p50.
  // Net cost: ~150ms of mostly-idle network for a worth-it UX win.
  const { mutate: swrMutate } = useSWRConfig();
  const refreshHistory = useCallback(() => {
    swrMutate(unstable_serialize(getChatHistoryPaginationKey));
  }, [swrMutate]);

  // Mutate on URL promote (earliest signal a new chat will exist).
  useEffect(() => {
    if (
      chatId === undefined &&
      messages.length > 0 &&
      typeof window !== "undefined" &&
      effectiveChatId
    ) {
      // 600ms gives onFinish + saveMessages lazy-upsert a head start.
      const handle = setTimeout(refreshHistory, 600);
      return () => clearTimeout(handle);
    }
    return;
  }, [chatId, effectiveChatId, messages.length, refreshHistory]);

  // Mutate on terminal status (success OR error).
  const [prevStatus, setPrevStatus] = useState(status);
  useEffect(() => {
    const becameTerminal =
      prevStatus === "streaming" && (status === "ready" || status === "error");
    if (becameTerminal && effectiveChatId) {
      const handle = setTimeout(refreshHistory, 250);
      setPrevStatus(status);
      return () => clearTimeout(handle);
    }
    if (prevStatus !== status) {
      setPrevStatus(status);
    }
    return;
  }, [status, prevStatus, refreshHistory, effectiveChatId]);

  const canSend = status === "ready" && input.trim().length > 0;
  const isStreaming = status === "streaming" || status === "submitted";

  // [Phase 5c] AI SDK v6 status === 'streaming' marks the in-flight turn.
  // Streaming reasoning parts ONLY appear in the last assistant message,
  // so we gate per-message: `Reasoning`'s auto-open/duration logic flips
  // on the trailing message and stays settled on every prior one.
  const lastMessage = messages.at(-1);
  const lastMessageId = lastMessage?.id;
  const isTurnStreaming = status === "streaming";
  const isEmpty = messages.length === 0;

  // [S.208 — 2026-05-20] Thinking indicator — switched from the custom
  // AWAKENING/THINKING badge (deleted with `ThinkingState`) to the
  // template's `<Shimmer>` text pulse. Same status-driven gate (pure
  // Vercel AI pattern, no per-event tracking): render whenever
  // `status === "submitted"` (request out, no events yet) OR
  // `status === "streaming"` AND the trailing assistant hasn't emitted
  // any visible content yet (still tool-calling or composing).
  //
  // Once text/reasoning starts streaming, the indicator unmounts — the
  // streaming text/reasoning IS the liveness signal. This mirrors how
  // the chatbot.ai-sdk.dev demo renders "Thinking..." as inline shimmer
  // text inside the trailing assistant message.
  const lastAssistantHasContent =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (p) =>
        (p.type === "text" && p.text.trim().length > 0) ||
        (p.type === "reasoning" && "text" in p && p.text?.trim().length > 0) ||
        p.type.startsWith("tool-")
    );
  const showThinking =
    status === "submitted" || (isTurnStreaming && !lastAssistantHasContent);

  // [Session 5.6 / S.202 — 2026-05-20] Chip tap handler. Mirrors the
  // template ChatShell pattern from `components/chat/shell.tsx`: fill the
  // composer with the canonical prompt, then defer focus until React has
  // re-rendered with the new value (without the rAF, `.focus()` lands on
  // the textarea BEFORE the controlled-input re-renders, so the caret
  // jumps to the start of the OLD value and the user's first keystroke
  // clobbers the chip prompt). The querySelector targets our plain
  // `<input>` rather than the template's `[data-testid=multimodal-input]`
  // textarea because audric-chat-client uses a simple input element.
  const handleChipClick = useCallback((prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="multimodal-input"]'
      );
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    });
  }, []);

  // Composer + chip bar block — reused in both layouts (centered hero
  // when empty, bottom-stick when messages exist).
  //
  // [Shell→demo chrome — 2026-05-30] Reverted the bespoke single-line
  // `<input>` + Send/Stop buttons to the vanilla AI Elements
  // `PromptInput` (multiline auto-grow textarea + status-aware submit)
  // to match the chatbot.ai-sdk.dev demo. Kept controlled via the
  // existing `input` state so the finance `ChipBar` can fill it. No
  // attachments menu (Audric has no file upload). `PromptInputSubmit`
  // maps Send→Stop off the chat `status` and fires the existing
  // `handleStop` (useChat.stop() + POST /api/chat/[id]/stop).
  const composerBlock = (
    <div className="flex w-full flex-col gap-3">
      <PromptInput
        onSubmit={(message) => {
          if (!canSend) {
            return;
          }
          const text = message.text.trim();
          if (text.length === 0) {
            return;
          }
          sendMessage({ text });
          setInput("");
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            // [2026-05-30] Trim the empty-state height: the AI Elements
            // default min-h-16 (64px) + the submit footer row reads tall
            // for Audric (no model picker / attachments fill the toolbar).
            // min-h-11 keeps a comfortable single line that still
            // auto-grows up to max-h-48.
            className="min-h-11"
            data-testid="multimodal-input"
            disabled={isStreaming}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            value={input}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit
            data-testid={isStreaming ? "stop-button" : "send-button"}
            disabled={!(isStreaming || canSend)}
            onStop={handleStop}
            status={status}
          />
        </PromptInputFooter>
      </PromptInput>
      <ChipBar
        hidden={status === "streaming" || status === "submitted"}
        onChipClick={handleChipClick}
      />
    </div>
  );

  // Empty-state hero — perplexity-style center-anchored composition.
  // BalanceHero + greeting from `<EmptyState />`, then the composer +
  // chips directly below. Once the user sends the first message the
  // layout swaps to the bottom-stick composer with the timeline above.
  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-8">
        <EmptyState />
        <div className="w-full max-w-2xl">{composerBlock}</div>
        {error && (
          <div className="w-full max-w-2xl rounded border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
            {sanitizeStreamErrorMessage(redactAddressesInText(error.message))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.map((m) => {
            const isLast = m.id === lastMessageId;

            // [Phase 5e] Scan parts for `data-audric-bundle` markers and
            // build a Set of bundle-claimed toolCallIds. Bundle-claimed
            // tool-* parts are folded into one BundlePermissionCard
            // (rendered from the marker) instead of N individual cards.
            //
            // [Smoke 2026-05-22 bundle-refresh-fix] A bundle is "spent"
            // once every constituent tool part has moved past
            // approval-requested (output-available / output-error). For
            // spent bundles we DON'T claim the IDs and DON'T render a
            // permission card — the individual tool parts render their
            // own receipts via the normal tool-* branch below. This
            // matches the single-write path (L845-865) which is
            // state-aware. The previous unconditional claim caused the
            // approval card to re-appear on session refresh because
            // `BundlePermissionCard`'s `resolved` flag lives in
            // `useState` and resets to false on every fresh mount.
            const bundleClaimedIds = new Set<string>();
            for (const part of m.parts) {
              if (part.type !== "data-audric-bundle") {
                continue;
              }
              const marker = parseAudricBundleMarker(
                (part as { data?: unknown }).data
              );
              if (!marker) {
                continue;
              }
              if (isBundleSpent(marker, m.parts)) {
                continue;
              }
              for (const step of marker.steps) {
                bundleClaimedIds.add(step.toolCallId);
              }
            }

            const isEditing = editingMessageId === m.id && m.role === "user";

            return (
              // [SPEC_AI_SDK_HARDENING P5.1-P5.4 hotfix — 2026-05-24]
              // `group` MUST live on an ANCESTOR of the actions div for
              // Tailwind's `group-hover:opacity-100` to fire. Prior to
              // this hotfix the class was on the `<Message>` element
              // (assistant only) — but the actions div is a SIBLING of
              // Message, not a descendant, so the hover scope never
              // resolved. Net: Copy / Edit / Vote / Regenerate were
              // permanently `opacity-0` in prod. Wrapping the whole row
              // (bubble + actions) in a `group` div fixes hover for
              // BOTH user and assistant rows in one shot.
              <div className="group flex flex-col" key={m.id}>
                {/* [SPEC_AI_SDK_HARDENING P5.1 — 2026-05-24]
                    Edit mode: swap the bubble for an inline textarea
                    + Save/Cancel buttons. Same dark bubble surface so
                    it reads as edit-in-place. Enter saves (without
                    shift), Escape cancels. */}
                {isEditing ? (
                  <Message className="items-end" from="user">
                    <div className="flex w-full max-w-[min(80%,56ch)] flex-col gap-2">
                      <Textarea
                        autoFocus
                        className="border-input bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40"
                        onChange={(e) => setEditingDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit(m.id);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        value={editingDraft}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={cancelEdit}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={!editingDraft.trim() || isTurnStreaming}
                          onClick={() => saveEdit(m.id)}
                          size="sm"
                          type="button"
                          variant="default"
                        >
                          Send
                        </Button>
                      </div>
                    </div>
                  </Message>
                ) : (
                  /* [S.209 — 2026-05-20] `items-end` on user Message — the
                      template's `<Message>` is a flex flex-col container.
                      `ml-auto` on Message snaps the Message wrapper to the
                      right edge, but the bubble (`<MessageContent>` with
                      `w-fit`) defaults to flex-start INSIDE the column.
                      Adding `items-end` flips the cross-axis alignment so
                      the bubble actually sits at the right of the chat
                      column — fixes the left-aligned user bubble bug. */
                  <Message
                    className={cn(m.role === "user" && "items-end")}
                    from={m.role}
                  >
                    <MessageContent
                      // [Shell→demo chrome — 2026-05-30] User bubble
                      // reverted to the AI Elements / chatbot.ai-sdk.dev
                      // stock look: a symmetric muted pill (no near-black
                      // fill, no bottom-right notch). Assistant turns now
                      // render plain (no 22px AudricMark gutter), matching
                      // the demo. `bg-muted` flips per theme automatically.
                      className={cn(
                        m.role === "user" &&
                          "w-fit max-w-[min(80%,56ch)] overflow-hidden break-words rounded-xl bg-muted px-4 py-2.5 text-foreground"
                      )}
                    >
                      {m.parts.map((part, i) => {
                        if (part.type === "text") {
                          return (
                            <MessageResponse
                              // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                              key={`${m.id}-${i}`}
                            >
                              {part.text}
                            </MessageResponse>
                          );
                        }
                        if (part.type === "reasoning") {
                          // [U1 — 2026-05-31] Render reasoning IN POSITION,
                          // merging only CONSECUTIVE reasoning parts into a
                          // single accordion (true vercel/chatbot parity).
                          // The prior impl hoisted ALL reasoning to the
                          // first reasoning index and concatenated it — so
                          // thinking that happened AFTER a tool call got
                          // yanked ABOVE the tool, producing the "jumping
                          // around" timeline the founder reported. A run is
                          // a maximal block of adjacent reasoning parts;
                          // we open one accordion at the run's start and
                          // skip the rest of the run.
                          const prev = m.parts[i - 1];
                          if (prev && prev.type === "reasoning") {
                            // Folded into the accordion opened at run start.
                            return null;
                          }
                          const runParts: ReasoningUIPart[] = [];
                          for (let j = i; j < m.parts.length; j++) {
                            const p = m.parts[j];
                            if (p.type !== "reasoning") {
                              break;
                            }
                            runParts.push(p as ReasoningUIPart);
                          }
                          const runText = runParts
                            .map((p) => p.text)
                            .filter((t) => t && t.trim().length > 0)
                            .join("\n\n");
                          if (!runText) {
                            return null;
                          }
                          const runStreaming =
                            isTurnStreaming &&
                            isLast &&
                            runParts.some((p) => p.state !== "done");
                          return (
                            <Reasoning
                              isStreaming={runStreaming}
                              // biome-ignore lint/suspicious/noArrayIndexKey: reasoning-run start index is positionally stable per message
                              key={`${m.id}-reasoning-${i}`}
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{runText}</ReasoningContent>
                            </Reasoning>
                          );
                        }
                        // [Phase 5e] Bundle marker → ONE bundle card.
                        if (part.type === "data-audric-bundle") {
                          const marker = parseAudricBundleMarker(
                            (part as { data?: unknown }).data
                          );
                          if (!marker || marker.steps.length < 2) {
                            // Malformed marker — render nothing; the
                            // individual `tool-*` parts will render
                            // separately because they're NOT in
                            // bundleClaimedIds (the set is empty when
                            // parse fails for ALL markers).
                            return null;
                          }
                          // [Smoke 2026-05-22 bundle-refresh-fix] Spent
                          // bundle (all steps past approval) → render
                          // nothing here. The constituent tool-* parts
                          // are NOT in bundleClaimedIds (see the matching
                          // skip above) so they fall through to the
                          // tool-* branch and render receipts/errors
                          // individually — same shape as a freshly
                          // approved single-write turn.
                          if (isBundleSpent(marker, m.parts)) {
                            return null;
                          }
                          return (
                            <BundleForMarker
                              addToolApprovalResponse={addToolApprovalResponse}
                              addToolOutput={addToolOutput}
                              // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                              key={`${m.id}-${i}`}
                              marker={marker}
                              session={session}
                            />
                          );
                        }
                        if (part.type.startsWith("tool-")) {
                          const toolPart = part as ToolUIPart;
                          // [Phase 5e] Skip tool parts that a bundle marker
                          // claimed — the BundlePermissionCard handles
                          // them. AI SDK's state machine still tracks
                          // each part's approval-requested → output-*
                          // lifecycle independently (the parent's
                          // bundle approve handler fires N
                          // `addToolApprovalResponse` + N `addToolOutput`
                          // to keep each part's state in sync).
                          if (bundleClaimedIds.has(toolPart.toolCallId)) {
                            return null;
                          }
                          if (toolPart.state === "approval-requested") {
                            return (
                              <PermissionForToolPart
                                addToolApprovalResponse={
                                  addToolApprovalResponse
                                }
                                addToolOutput={addToolOutput}
                                // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                                key={`${m.id}-${i}`}
                                session={session}
                                toolPart={toolPart}
                              />
                            );
                          }
                          return (
                            <ToolResultRouter
                              // biome-ignore lint/suspicious/noArrayIndexKey: parts are positionally stable per message
                              key={`${m.id}-${i}`}
                              onSendMessage={(text) => sendMessage({ text })}
                              part={toolPart}
                            />
                          );
                        }
                        return null;
                      })}
                    </MessageContent>
                  </Message>
                )}
                {/* [P1-B + SPEC_AI_SDK_HARDENING P5.1/P5.2/P5.3/P5.4]
                    Row actions: Copy (both roles) + Edit (user rows
                    only) + Regenerate (last assistant only) + Vote
                    thumbs (assistant only, with vote-state hydrated
                    from GET /api/vote on chat mount).
                    Hidden during streaming on the trailing assistant
                    so we don't show actions for an in-flight reply,
                    and during edit mode for this message so the
                    textarea has clean focus. Hover-visible to keep
                    the timeline clean. */}
                {!isEditing && !(isLast && isTurnStreaming) && (
                  // [P5.1-P5.4 hotfix] `justify-end` for user rows so the
                  // action icons sit under the right-aligned bubble;
                  // assistant rows default to left-aligned (under their
                  // left-aligned bubble). Without this, user-row actions
                  // floated to the left, visually disconnected from the
                  // bubble they belong to.
                  <div
                    className={cn(
                      "mt-1 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                      m.role === "user" && "justify-end"
                    )}
                  >
                    <MessageAction
                      label="Copy"
                      onClick={() => handleCopy(m)}
                      tooltip="Copy"
                    >
                      <Copy className="size-3.5" />
                    </MessageAction>
                    {m.role === "user" && (
                      <MessageAction
                        disabled={isTurnStreaming}
                        label="Edit"
                        onClick={() => beginEdit(m)}
                        tooltip="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </MessageAction>
                    )}
                    {m.role === "assistant" && isLast && (
                      <MessageAction
                        disabled={isTurnStreaming}
                        label="Regenerate"
                        onClick={handleRegenerate}
                        tooltip="Regenerate"
                      >
                        <RotateCw className="size-3.5" />
                      </MessageAction>
                    )}
                    {m.role === "assistant" && effectiveChatId && (
                      <MessageVoteThumbs
                        chatId={effectiveChatId}
                        initialVote={votesByMessageId.get(m.id) ?? null}
                        messageId={m.id}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* [S.208 — 2026-05-20] Thinking shimmer — template-native
              indicator. Phantom assistant message rendered during the
              gap between user send and first event (text / reasoning /
              tool-call). Status-driven (no per-event tracking),
              unmounts as soon as the trailing message gets any visible
              content. Same UX as chatbot.ai-sdk.dev's "Thinking..." in
              the trailing assistant slot. */}
          {showThinking && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/*
       * Sticky-bottom composer block — sits below the timeline when at
       * least one message has been sent. The empty-state hero uses the
       * SAME `composerBlock` JSX above; the only delta is positioning
       * (centered hero vs sticky-bottom strip).
       *
       * [Phase 6.5 C.3 / S.198] Error display moved inline below the
       * composer (was a free-floating block in the old layout). Same
       * defense-in-depth sanitization: server-side route sanitizes
       * tool-output-error / error chunks before they cross the wire;
       * client-side here covers client-thrown ChatbotErrors
       * (rate-limit, network) that never touched the route.
       */}
      <div className="sticky bottom-0 z-10 border-border/40 border-t bg-background/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          {composerBlock}
        </div>
        {error && (
          <div className="mx-auto w-full max-w-2xl px-4 pb-3">
            <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
              {sanitizeStreamErrorMessage(redactAddressesInText(error.message))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

interface PermissionForToolPartProps {
  addToolApprovalResponse: ReturnType<
    typeof useChat
  >["addToolApprovalResponse"];
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  session: ZkLoginSession;
  toolPart: ToolUIPart;
}

/**
 * Bridge between an AI-SDK-paused tool part and the audric
 * sponsored-tx flow. Extracts the audric metadata, the tool input, and
 * the approval id from the ToolUIPart, then wires the Approve / Deny
 * callbacks into the `useChat` HITL helpers.
 */
function PermissionForToolPart(props: PermissionForToolPartProps) {
  const { toolPart, session, addToolApprovalResponse, addToolOutput } = props;

  // `toolPart.type` is `tool-<name>` per AI SDK's UIMessagePart contract.
  const toolName = toolPart.type.startsWith("tool-")
    ? toolPart.type.slice("tool-".length)
    : toolPart.type;

  const metadata = parseAudricMetadata(toolPart.toolMetadata);
  if (!metadata) {
    // Shouldn't happen for any confirm-tier tool wired through the
    // server route — but render a graceful fallback so the user can
    // still deny if metadata went missing for any reason.
    return (
      <div className="my-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        Tool {toolName} requested approval but no metadata was attached.{" "}
        <Button
          onClick={() => {
            (async () => {
              try {
                await addToolApprovalResponse({
                  id: toolPart.approval?.id ?? "",
                  approved: false,
                  reason: "Missing metadata — auto-denied",
                });
                await addToolOutput({
                  tool: toolName,
                  toolCallId: toolPart.toolCallId,
                  state: "output-error",
                  errorText: "Auto-denied: missing tool metadata.",
                });
              } catch (err) {
                console.error("[audric-chat] auto-deny failed:", err);
              }
            })();
          }}
          size="sm"
          variant="outline"
        >
          Deny
        </Button>
      </div>
    );
  }

  const approvalId = toolPart.approval?.id;
  if (!approvalId) {
    return null;
  }

  return (
    <PermissionCard
      borrowApyBps={metadata.borrowApyBps}
      currentHF={metadata.currentHF}
      description={metadata.description}
      input={(toolPart.input ?? {}) as Record<string, unknown>}
      // Re-yield (user edits a modifiable field → engine re-asks) stamps a
      // fresh approvalId per the harness spec. Keying on it remounts the
      // card so the 60s deny-timer + edited-input state rebase instead of
      // carrying a stale countdown/value.
      key={approvalId}
      modifiableFields={metadata.modifiableFields}
      onApprove={async (modifiedInput) => {
        // 1. Tell AI SDK the user approved. Reason field is optional;
        // we omit it for the happy path.
        await addToolApprovalResponse({ id: approvalId, approved: true });

        // 2. Run the per-tool execution.
        //
        // [Phase 3 outcome-update slice / Phase 4 widening] Measure
        // the client-side execution wall time (Approve tap → result
        // returns) and stash it in `output.writeToolDurationMs`.
        // `/api/audric-chat` reads it off the resume turn's message
        // history and runs the cross-turn
        // `prisma.turnMetrics.updateMany({where: {attemptId}})` to
        // populate the row's `pendingActionOutcome` +
        // `writeToolDurationMs` fields (closes harness Spec §Item 3
        // G5 acceptance).
        const writeStartMs = Date.now();
        try {
          // [S.243 / V07E_CONTACTS_SIMPLIFICATION Path A — 2026-05-22]
          // All 10 web-v2 writes are sponsored on-chain ops. The old
          // save_contact dispatch branch (Prisma-only Postgres write)
          // was removed alongside the contacts feature deletion.
          const request = buildSponsoredTxRequest(toolName, modifiedInput);
          if (!request) {
            throw new Error(
              `Unknown write tool ${toolName} — dispatch missing.`
            );
          }
          const result = await sponsoredTx({ ...request, session });
          await addToolOutput({
            tool: toolName,
            toolCallId: toolPart.toolCallId,
            output: buildToolOutput(request, result, Date.now() - writeStartMs),
          });
        } catch (err) {
          await addToolOutput({
            tool: toolName,
            toolCallId: toolPart.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : "Write tool failed",
          });
          throw err;
        }
      }}
      onDeny={async () => {
        await addToolApprovalResponse({
          id: approvalId,
          approved: false,
          reason: "User declined",
        });
        await addToolOutput({
          tool: toolName,
          toolCallId: toolPart.toolCallId,
          state: "output-error",
          errorText: "User denied the action.",
        });
      }}
      projectedHF={metadata.projectedHF}
      toolName={toolName}
    />
  );
}

// ---------------------------------------------------------------------------
// [Phase 5e — S.183] Bundle marker bridge — multi-write atomic Payment
// Intent. Maps the `data-audric-bundle` part's payload to a single
// `BundlePermissionCard` render + fans the single approve gesture out
// to N `addToolApprovalResponse` + 1 `sponsoredTx({type:'bundle'})` +
// N `addToolOutput` calls so AI SDK's per-tool state machine sees
// individual resolutions while the user experiences one signature.
// ---------------------------------------------------------------------------

interface BundleForMarkerProps {
  addToolApprovalResponse: ReturnType<
    typeof useChat
  >["addToolApprovalResponse"];
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  marker: AudricBundleMarkerData;
  session: ZkLoginSession;
}

/**
 * [Phase 5e] Bridge between a `data-audric-bundle` marker and the
 * audric sponsored-tx bundle flow. The marker carries everything the
 * card needs to render + everything the parent needs to dispatch back
 * to AI SDK and Sui (one signature, atomic PTB).
 */
function BundleForMarker(props: BundleForMarkerProps) {
  const { marker, session, addToolApprovalResponse, addToolOutput } = props;

  const steps: BundlePermissionCardStep[] = marker.steps.map((s) => ({
    toolCallId: s.toolCallId,
    approvalId: s.approvalId,
    toolName: s.toolName,
    input: s.input,
    description: s.description,
    modifiableFields: s.modifiableFields,
  }));

  return (
    <BundlePermissionCard
      // Same re-yield remount as the single card — a fresh set of step
      // approvalIds rebases the bundle's timer/state.
      key={steps.map((s) => s.approvalId).join("-")}
      onApprove={async () => {
        // 1. Tell AI SDK every step is approved. We fan out first so
        // the server doesn't block waiting on individual responses
        // while we run the sponsored-tx round-trip. Errors here are
        // unrecoverable for the bundle (a partial-approval state
        // confuses AI SDK's assembler), so we surface and abort.
        for (const step of steps) {
          await addToolApprovalResponse({
            id: step.approvalId,
            approved: true,
          });
        }

        // 2. Build the SponsoredTxBundleStep[] payload for one
        // sponsored-tx round-trip. Bundle MVP uses LLM-emitted input
        // verbatim — per-step modifiable editing is deferred.
        //
        // [P7.2 — 2026-05-25] Forward each step's `inputCoinFromStep`
        // to the sponsored-tx layer. The marker carries it (mapped by
        // `BundleForMarker.steps` below from `marker.steps[i]`).
        // Without this passthrough the prepare-route would compose
        // the bundle in wallet-mode, defeating chain-mode handoff for
        // whitelisted pairs.
        const bundleSteps: SponsoredTxBundleStep[] = steps.map((step, idx) => {
          const chainRef = marker.steps[idx]?.inputCoinFromStep;
          const cetusRoute = marker.steps[idx]?.cetusRoute;
          return {
            toolName: step.toolName as SponsoredTxBundleStep["toolName"],
            input: step.input,
            ...(typeof chainRef === "number"
              ? { inputCoinFromStep: chainRef }
              : {}),
            ...(cetusRoute === undefined ? {} : { cetusRoute }),
          };
        });

        const writeStartMs = Date.now();
        let result: SponsoredTxResult;
        try {
          result = await sponsoredTx({
            type: "bundle",
            steps: bundleSteps,
            session,
          });
        } catch (err) {
          // 3a. On dispatch failure: fan out N output-errors so AI
          // SDK's assembler can resolve every tool part and the
          // resume turn lets the LLM narrate the failure.
          const errorText =
            err instanceof Error ? err.message : "Bundle transaction failed";
          for (const step of steps) {
            await addToolOutput({
              tool: step.toolName,
              toolCallId: step.toolCallId,
              state: "output-error",
              errorText,
            });
          }
          throw err;
        }

        // 3b. On success: fan out N tool-outputs with the SAME digest +
        // balanceChanges. Sui PTBs return one digest + one combined
        // balance-change array for the whole tx; the LLM sees N
        // tool-results all referencing the same digest, which it
        // narrates as one atomic settlement ("Saved $X and swapped
        // $Y in one transaction · digest 0x...").
        const writeToolDurationMs = Date.now() - writeStartMs;
        for (const step of steps) {
          await addToolOutput({
            tool: step.toolName,
            toolCallId: step.toolCallId,
            output: {
              digest: result.digest,
              balanceChanges: result.balanceChanges,
              writeToolDurationMs,
              // Tag the per-step output with the bundle's identity so
              // downstream warehouse joins can split bundle vs single
              // resolutions when surfaced telemetry lands.
              partOfBundle: true,
              bundleStepCount: steps.length,
            },
          });
        }
      }}
      onDeny={async () => {
        // Symmetric fan-out — N approval-responses with approved=false
        // + N output-errors. Engine's resume turn sees structured
        // rejection per step and the LLM narrates a clean abort
        // ("Okay, I won't proceed with the bundle — let me know if
        // you want to do anything else").
        for (const step of steps) {
          await addToolApprovalResponse({
            id: step.approvalId,
            approved: false,
            reason: "User declined bundle",
          });
        }
        for (const step of steps) {
          await addToolOutput({
            tool: step.toolName,
            toolCallId: step.toolCallId,
            state: "output-error",
            errorText: "User denied the bundle.",
          });
        }
      }}
      steps={steps}
    />
  );
}

// `isBundleSpent` + `AudricBundleMarkerData` moved to
// `lib/audric/bundle-status.ts` 2026-05-24 (SPEC_AI_SDK_HARDENING P5.1).
// See that file for the full bundle-refresh-fix rationale.

/**
 * [Phase 5e] Parse + validate a `data-audric-bundle` part's payload.
 * Mirrors `parseAudricMetadata` — gracefully degrade if a stale frame
 * ships a different shape, so the rest of the message still renders.
 */
function parseAudricBundleMarker(
  raw: unknown
): AudricBundleMarkerData | undefined {
  if (raw === null || typeof raw !== "object") {
    return;
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.steps)) {
    return;
  }
  const steps: AudricBundleMarkerData["steps"] = [];
  for (const s of obj.steps) {
    if (s === null || typeof s !== "object") {
      continue;
    }
    const step = s as Record<string, unknown>;
    if (
      typeof step.toolCallId !== "string" ||
      typeof step.approvalId !== "string" ||
      typeof step.toolName !== "string" ||
      typeof step.description !== "string" ||
      step.input === null ||
      typeof step.input !== "object" ||
      !Array.isArray(step.modifiableFields)
    ) {
      continue;
    }
    const modifiableFields = step.modifiableFields.filter(
      (f): f is { name: string; kind: string; asset?: string } =>
        f !== null &&
        typeof f === "object" &&
        typeof (f as Record<string, unknown>).name === "string" &&
        typeof (f as Record<string, unknown>).kind === "string"
    );
    // [P7.2 — 2026-05-25] Parse `inputCoinFromStep` defensively. Must be a
    // non-negative integer; anything else is dropped (stale frame / future-
    // schema marker). The downstream SDK re-validates with `CHAIN_MODE_INVALID`
    // (forward-only `< i`) so a bad value here can't reach on-chain.
    const inputCoinFromStep =
      typeof step.inputCoinFromStep === "number" &&
      Number.isInteger(step.inputCoinFromStep) &&
      step.inputCoinFromStep >= 0
        ? step.inputCoinFromStep
        : undefined;
    // [P7.3 — 2026-05-25] Pass `cetusRoute` through as opaque payload.
    // The prepare-route Zod schema does the structural check, and the
    // SDK's `deserializeCetusRoute` does the type-safe rehydration.
    // Client just forwards it verbatim; bad payloads can't reach
    // on-chain because the prepare-route rejects them or the SDK falls
    // back to fresh `findSwapRoute()` on shape mismatch.
    const cetusRoute =
      step.cetusRoute !== null &&
      typeof step.cetusRoute === "object" &&
      "routerData" in (step.cetusRoute as Record<string, unknown>)
        ? step.cetusRoute
        : undefined;
    steps.push({
      toolCallId: step.toolCallId,
      approvalId: step.approvalId,
      toolName: step.toolName,
      input: step.input as Record<string, unknown>,
      description: step.description,
      modifiableFields,
      ...(inputCoinFromStep === undefined ? {} : { inputCoinFromStep }),
      ...(cetusRoute === undefined ? {} : { cetusRoute }),
    });
  }
  if (steps.length === 0) {
    return;
  }
  return { steps };
}

/**
 * Validate + parse the `toolMetadata` blob we stamped server-side. We
 * intentionally don't use Zod here because the route owns the schema
 * and the round-trip is identity — but we still typecheck the shape
 * to gracefully degrade if a stale frame ships from an in-flight
 * deploy that wrote a different blob.
 */
function parseAudricMetadata(raw: unknown):
  | {
      description: string;
      modifiableFields: readonly PermissionCardModifiableField[];
      // [SPEC_AI_SDK_HARDENING P5.6 — 2026-05-24] HF/APY enrichment
      // fields stamped by the server's `buildAudricToolMetadata`. All
      // three are independently optional so partial population (e.g.
      // HF unavailable due to a degraded portfolio fetch) doesn't
      // break consumers — preview bodies degrade row-by-row.
      borrowApyBps?: number;
      currentHF?: number | null;
      projectedHF?: number | null;
    }
  | undefined {
  if (raw === null || typeof raw !== "object") {
    return;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.description !== "string") {
    return;
  }
  const fields = Array.isArray(obj.modifiableFields)
    ? obj.modifiableFields.filter(
        (f): f is PermissionCardModifiableField =>
          f !== null &&
          typeof f === "object" &&
          typeof (f as Record<string, unknown>).name === "string" &&
          typeof (f as Record<string, unknown>).kind === "string"
      )
    : [];
  const borrowApyBps =
    typeof obj.borrowApyBps === "number" && Number.isFinite(obj.borrowApyBps)
      ? obj.borrowApyBps
      : undefined;
  const currentHF = parseHFField(obj.currentHF);
  const projectedHF = parseHFField(obj.projectedHF);
  return {
    description: obj.description,
    modifiableFields: fields,
    ...(borrowApyBps === undefined ? {} : { borrowApyBps }),
    ...(currentHF === undefined ? {} : { currentHF }),
    ...(projectedHF === undefined ? {} : { projectedHF }),
  };
}

/**
 * HF semantics on the wire: `number` = finite HF, `null` = ∞ (no
 * debt), absent = data unavailable. We distinguish "absent" from
 * "null on the wire" so the preview body can render "→ ∞" when the
 * projection lands at no-debt vs hiding the row entirely when the
 * server couldn't compute.
 */
function parseHFField(raw: unknown): number | null | undefined {
  if (raw === null) {
    return null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  return;
}

// ---------------------------------------------------------------------------
// Phase 4 dispatch helpers — convert engine tool name + input → the typed
// sponsoredTx request body (or a server-route call for the special cases).
// ---------------------------------------------------------------------------

/**
 * Map an engine tool name + modified input → the `SponsoredTxRequest`
 * shape that `lib/audric/sponsored-tx.ts` consumes. Each branch reads
 * the field names from the engine tool's `inputSchema` (defined in
 * `packages/engine/src/tools/<tool>.ts`).
 *
 * Returns `undefined` for tools that don't have a sponsored-tx
 * mapping (read-only tools, or tools the LLM cannot dispatch).
 */
function buildSponsoredTxRequest(
  toolName: string,
  input: Record<string, unknown>
): SponsoredTxRequest | undefined {
  switch (toolName) {
    case "save_deposit":
      return {
        type: "save",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "withdraw":
      return {
        type: "withdraw",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "borrow":
      return {
        type: "borrow",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "repay_debt":
      return {
        type: "repay",
        amount: Number(input.amount),
        asset: (input.asset as "USDC" | "USDsui" | undefined) ?? "USDC",
      };
    case "send_transfer":
      // [S.264 — 2026-05-23] Thread `input.asset` through. Pre-fix this
      // hardcoded `asset: "USDC"`, so a `send_transfer({ asset: "SUI" })`
      // emitted by the LLM (correctly per the engine tool's "send ANY
      // supported token" contract) was silently coerced to USDC and a
      // user asking to send 0.5 SUI lost 0.5 USDC instead. The SDK's
      // `composeTx.send_transfer` already supports all 9 SUPPORTED_ASSETS
      // (USDC, USDsui, SUI, USDT, USDe, WAL, ETH, NAVX, GOLD); the
      // `OPERATION_ASSETS.send: '*'` rule in SDK constants is the
      // authoritative allow-list.
      return {
        type: "send",
        amount: Number(input.amount),
        recipient: String(input.to ?? ""),
        asset: (input.asset as SupportedAsset | undefined) ?? "USDC",
      };
    case "swap_execute":
      return {
        type: "swap",
        amount: Number(input.amount),
        from: String(input.from ?? ""),
        to: String(input.to ?? ""),
        ...(input.slippage === undefined
          ? {}
          : { slippage: Number(input.slippage) }),
        ...(input.byAmountIn === undefined
          ? {}
          : { byAmountIn: Boolean(input.byAmountIn) }),
      };
    case "claim_rewards":
      return { type: "claim-rewards" };
    case "harvest_rewards":
      return {
        type: "harvest",
        ...(input.slippage === undefined
          ? {}
          : { slippage: Number(input.slippage) }),
        ...(input.minRewardUsd === undefined
          ? {}
          : { minRewardUsd: Number(input.minRewardUsd) }),
      };
    // [S.277] volo_stake / volo_unstake cases removed — engine tools
    // cut in 2.18.0 ("Earns Its Keep" audit).
    default:
      return;
  }
}

/**
 * Build the `addToolOutput` payload per tool. We pass back the
 * specific fields the LLM's narration prompt expects (`tx`, `amount`,
 * `from`, etc.) so the resume-turn narration reads as if the engine
 * itself had executed the write. Branches off `request.type` rather
 * than the tool name — same source of truth as `buildSponsoredTxRequest`.
 */
function buildToolOutput(
  request: SponsoredTxRequest,
  result: SponsoredTxResult,
  writeToolDurationMs: number
): Record<string, unknown> {
  const base = {
    success: true,
    tx: result.digest,
    balanceChanges: result.balanceChanges,
    writeToolDurationMs,
  };
  switch (request.type) {
    case "save":
    case "withdraw":
    case "borrow":
    case "repay":
      return {
        ...base,
        amount: request.amount,
        asset: request.asset ?? "USDC",
      };
    case "send":
      return {
        ...base,
        amount: request.amount,
        recipient: request.recipient,
        asset: request.asset ?? "USDC",
      };
    case "swap":
      return {
        ...base,
        amount: request.amount,
        from: request.from,
        to: request.to,
      };
    // [S.277] volo-stake / volo-unstake cases removed — engine tools
    // cut in 2.18.0 ("Earns Its Keep" audit).
    case "harvest":
      // [Smoke 2026-05-22 harvest-plan-threading] Merge the per-leg
      // breakdown computed at prepare time (claimed/swaps/skipped/
      // expectedUsdcDeposited). The plan flows: composeTx →
      // perStepPreviews[0] → prepare response `harvestPlan` →
      // SponsoredTxResult.harvestPlan → tool output. Without this merge
      // the receipt card has no data to render and the LLM has nothing
      // to narrate, leaving the user looking at "Harvested: No rewards
      // available" alongside an actual savings increase. Mirrors
      // `apps/web/hooks/executeToolAction.ts` L307-321.
      return {
        ...base,
        ...(result.harvestPlan
          ? {
              claimed: result.harvestPlan.claimed,
              swaps: result.harvestPlan.swaps,
              skipped: result.harvestPlan.skipped,
              expectedUsdcDeposited: result.harvestPlan.expectedUsdcDeposited,
            }
          : {}),
      };
    default:
      // claim-rewards carries no amount in the request — the
      // balanceChanges array describes what actually moved.
      return base;
  }
}
