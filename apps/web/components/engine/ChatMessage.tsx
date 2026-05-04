'use client';

import { useMemo } from 'react';
import type { EngineChatMessage, PendingAction } from '@/lib/engine-types';
import { ThinkingState } from './ThinkingState';
import { ReasoningTimeline } from './ReasoningTimeline';
import { LegacyReasoningRender } from './LegacyReasoningRender';
import { RetryInterruptedTurn } from './RetryInterruptedTurn';
import { ConfirmChips } from './ConfirmChips';
import type { DenyReason } from './PermissionCard';
import { currentHarnessVersion, type HarnessVersion } from '@/lib/interactive-harness';
import { isConfirmChipsEnabled } from '@/lib/confirm-chips';
import { useVoiceModeContext } from '@/components/dashboard/VoiceModeContext';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.3 — ChatMessage gate
//
// ChatMessage is now a thin renderer-selector. It:
//   1. Handles the user-bubble path (shared between v2 and legacy).
//   2. Picks between the new <ReasoningTimeline> (v2) and
//      <LegacyReasoningRender> (legacy) based on the per-session
//      pinned harness version.
//
// All assistant-side rendering logic (tools, canvases, thinking,
// permission-card, voice-mode highlighting, final text) lives in the
// chosen child. ChatMessage itself does not call any of the rendering
// hooks — keeping the per-render hook tree of v2 and legacy paths
// fully independent.
// ───────────────────────────────────────────────────────────────────────────

interface ChatMessageProps {
  message: EngineChatMessage;
  onActionResolve?: (
    action: PendingAction,
    approved: boolean,
    reason?: DenyReason,
    modifications?: Record<string, unknown>,
  ) => void;
  /**
   * [v1.4 hotfix] Single tier-aware predicate that decides whether to
   * skip rendering the `<PermissionCard>` because the action will be
   * auto-resolved by `<UnifiedTimeline>`'s effect. Replaces the old
   * `autoApproveTools: Set<string>` + `agentBudget` pair, both of
   * which ignored the user's safety preset.
   */
  // [F14-fix-2 / 2026-05-03] MUST include `steps` so bundle iteration
  // runs in `shouldClientAutoApprove`. See PermissionCardBlockView.tsx
  // F14-fix-2 comment for the full root-cause writeup.
  shouldAutoApprove?: (
    action: Pick<PendingAction, 'toolName' | 'input' | 'steps'>,
  ) => boolean;
  onSendMessage?: (text: string) => void;
  /** Saved contacts — passed through so PermissionCard can render
   *  the Saved-contact badge / near-contact warning / save field. */
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  /** User's own zkLogin address — for the "self-send" badge. */
  walletAddress?: string | null;
  /** Concatenated last ~10 user messages — for the
   *  "Address from your message" badge. */
  recentUserText?: string;
  /**
   * [SPEC 8 v0.5.1 B3.3 / G4] Per-session harness version pinned by the
   * server (via the `session` SSE event / sessions GET response). When
   * provided, the renderer trusts this value over the `NEXT_PUBLIC_*`
   * env-var; this is what prevents a flag flip mid-rollout from
   * changing how a session that started under "legacy" gets rendered
   * partway through.
   *
   * `null` (the unauth/demo path or pre-server-announce moment) falls
   * back to `currentHarnessVersion()` which reads the env-var.
   */
  pinnedHarnessVersion?: HarnessVersion | null;
  /**
   * [SPEC 7 P2.4b] Quote-Refresh handler — forwarded to the
   * `<PermissionCard>` slot in both the v2 (`<ReasoningTimeline>`) and
   * legacy (`<LegacyReasoningRender>`) render paths. When omitted, no
   * Regenerate button appears even on bundles that support it (parent
   * has opted out of the feature).
   */
  onRegenerate?: (action: PendingAction) => void;
  regeneratingAttemptIds?: ReadonlySet<string>;
  /**
   * [SPEC 15 Phase 2 commit 2] Chip click handler — invoked when the
   * user taps Confirm / Cancel on a multi-write plan. Wired up by
   * `<UnifiedTimeline>` from `engine.sendChipDecision`. When omitted
   * (e.g. unauth/demo sessions), `<ConfirmChips />` does not render
   * even if `message.expectsConfirm` is set + the env flag is on.
   */
  onChipDecision?: (decision: { value: 'yes' | 'no'; forStashId: string }) => void;
  /**
   * [SPEC 15 v0.6 — Unified quote refresh] Refresh-chip click handler.
   * Functionally identical to `onSendMessage(text)` but tags the
   * server-side request with `refreshDecision: { via: 'chip' }` so
   * the unified `audric.quote_refresh.fired{surface=chip}` counter
   * fires. Wired up by `<UnifiedTimeline>` from
   * `engine.sendRefreshClick`. Falls back to `onSendMessage` when
   * omitted (legacy callers / unauth path) — same UX, just no chip
   * surface attribution in telemetry.
   */
  onRefreshClick?: (text: string) => void;
}

export function ChatMessage({
  message,
  onActionResolve,
  shouldAutoApprove,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
  pinnedHarnessVersion,
  onRegenerate,
  regeneratingAttemptIds,
  onChipDecision,
  onRefreshClick,
}: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3" role="log" aria-label="Your message">
        {/* User bubble — near-black with white text in BOTH light and dark.
            Cannot use bg-surface-inverse / text-fg-inverse here because those
            tokens semantically invert per theme (white-on-black in light flips
            to black-on-white in dark — wrong for a user chat chip). The
            --bubble-user-* token pair pins the bubble to "near-black + white"
            in both themes, matching the dark prototype's user-bubble frame
            (audric-app-dark/dashboard.jsx line 124) and the light prototype's
            equivalent (background:'var(--text)', color:'#fff'). The hairline
            border is invisible on the white page in light, but provides the
            #0A0A0A-on-#141414 separation the dark spec calls for. */}
        <div className="max-w-[78%] bg-bubble-user-bg px-4 py-2.5 text-sm text-bubble-user-fg break-words overflow-hidden border border-border-subtle" style={{ borderRadius: '16px 16px 4px 16px' }}>
          {message.content}
        </div>
      </div>
    );
  }

  // [SPEC 8 v0.5.1 B3.3 / G4] Pinned per-session decision wins over the
  // env-var. Falls back to `currentHarnessVersion()` for the unauth/
  // demo path and the brief moment before the server's `session` event
  // arrives. The empty-timeline guard remains: B2.1 dual-writes the
  // timeline for every engine ≥1.4.0 message, but a "legacy"-pinned
  // session never gets the new renderer regardless of timeline contents.
  const effectiveVersion = pinnedHarnessVersion ?? currentHarnessVersion();
  const useNewTimeline =
    effectiveVersion === 'v2' &&
    message.timeline !== undefined &&
    message.timeline.length > 0;

  // [SPEC 15 Phase 2 commit 2] Chip render is shared across v2 and
  // legacy assistant render paths. Three gates, all required:
  //   1. Server emitted `expects_confirm` for this message → payload set.
  //   2. Frontend env flag NEXT_PUBLIC_CONFIRM_CHIPS_V1 is "1"/"true".
  //   3. Caller wired up `onChipDecision` (auth/demo split — unauth
  //      sessions can't dispatch bundles anyway, no need to render).
  // Stops streaming = chips lock once the next assistant turn starts.
  //
  // [v0.5 — Refresh-on-expiry intent replay] When `onSendMessage` is
  // wired (the common case — `<UnifiedTimeline>` always passes
  // `onSendMessage ?? engine.sendMessage`), the Refresh chip replays
  // the originating user intent verbatim. The SSE reducer captures
  // it onto `payload.originatingUserText` at `expects_confirm` time;
  // we fall back to a literal "refresh quote" only when the capture
  // missed (legacy server / stream lifecycle edge). Replaying the
  // original intent text deterministically re-runs swap_quote +
  // prepare_bundle via plan-context promotion — fixes the
  // production-observed gap where Sonnet read literal "refresh
  // quote" as quote-only and skipped re-bundling (2026-05-04).
  //
  // [v0.6 — Unified telemetry] Prefer `onRefreshClick` when wired so
  // the server-side `audric.quote_refresh.fired{surface=chip}`
  // counter fires; falls back to `onSendMessage` for legacy callers
  // / tests where the click was indistinguishable from a normal text
  // turn. Both paths produce identical UX — the difference is purely
  // observability.
  const refreshTargetText = message.expectsConfirm?.originatingUserText ?? 'refresh quote';
  const refreshDispatcher = onRefreshClick ?? onSendMessage;
  const chipsBlock =
    message.expectsConfirm &&
    onChipDecision &&
    isConfirmChipsEnabled() &&
    !message.isStreaming ? (
      <ConfirmChips
        payload={message.expectsConfirm}
        onChipDecision={onChipDecision}
        onRefresh={refreshDispatcher ? () => refreshDispatcher(refreshTargetText) : undefined}
      />
    ) : null;

  if (useNewTimeline) {
    const hasTools = message.tools && message.tools.length > 0;
    return (
      <>
        <ChatMessageV2
          message={message}
          hasTools={!!hasTools}
          onActionResolve={onActionResolve}
          onSendMessage={onSendMessage}
          contacts={contacts}
          walletAddress={walletAddress}
          recentUserText={recentUserText}
          shouldAutoApprove={shouldAutoApprove}
          onRegenerate={onRegenerate}
          regeneratingAttemptIds={regeneratingAttemptIds}
        />
        {chipsBlock}
      </>
    );
  }

  return (
    <>
      <LegacyReasoningRender
        message={message}
        onActionResolve={onActionResolve}
        shouldAutoApprove={shouldAutoApprove}
        onSendMessage={onSendMessage}
        contacts={contacts}
        walletAddress={walletAddress}
        recentUserText={recentUserText}
        onRegenerate={onRegenerate}
        regeneratingAttemptIds={regeneratingAttemptIds}
      />
      {/* [B3.4 / Gap J] Legacy path: render the same retry pill so a
          flag-OFF session that gets cut off still has an obvious
          recovery affordance. The legacy renderer doesn't own
          `<RetryInterruptedTurn>` itself — extracting from
          `LegacyReasoningRender` would force every test fixture to
          add a voice-mode provider, and ChatMessage already owns the
          `onSendMessage` callback. */}
      {message.interrupted && message.interruptedReplayText && onSendMessage && (
        <RetryInterruptedTurn
          replayText={message.interruptedReplayText}
          onRetry={onSendMessage}
        />
      )}
      {chipsBlock}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — v2 assistant render branch (audit Gap F)
//
// Extracted into a sub-component so the voice-mode hook only runs on
// the v2 path. The legacy branch already calls `useVoiceModeContext`
// inside `<LegacyReasoningRender>`, so each render path consults the
// context independently and the React hook tree stays stable per
// branch.
// ───────────────────────────────────────────────────────────────────────────

interface ChatMessageV2Props extends Omit<ChatMessageProps, 'pinnedHarnessVersion'> {
  hasTools: boolean;
}

function ChatMessageV2({
  message,
  hasTools,
  onActionResolve,
  shouldAutoApprove,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
  onRegenerate,
  regeneratingAttemptIds,
}: ChatMessageV2Props) {
  const voice = useVoiceModeContext();
  const isBeingSpoken =
    voice.state === 'speaking' &&
    voice.speakingMessageId === message.id &&
    !!voice.currentSpans;

  // [SPEC 8 v0.5.1 audit polish] Stabilise the voiceContext object so
  // ReasoningTimeline's per-block memoisation doesn't break on every
  // parent render. Without this, every text-delta on a sibling message
  // forced a full timeline rerender chain (each block recomputed even
  // when its own data was reference-equal). Recomputes only when the
  // active speaker, span set, or word position changes.
  const voiceContext = useMemo(
    () =>
      isBeingSpoken
        ? { spans: voice.currentSpans!, spokenWordIndex: voice.spokenWordIndex }
        : undefined,
    [isBeingSpoken, voice.currentSpans, voice.spokenWordIndex],
  );

  return (
    <div className="space-y-2" role="log" aria-label="Audric response">
      {/* Same "thinking-only" spinner as the legacy path — the timeline
          doesn't render anything until the first SSE event arrives, so
          we still need a "Audric is thinking" hint for early frames. */}
      {message.isThinking && !message.content && !hasTools && message.timeline!.length === 0 && (
        <div className="pl-1">
          <ThinkingState status="thinking" intensity="active" />
        </div>
      )}

      <ReasoningTimeline
        blocks={message.timeline!}
        isStreaming={message.isStreaming}
        onActionResolve={onActionResolve}
        onSendMessage={onSendMessage}
        contacts={contacts}
        walletAddress={walletAddress}
        recentUserText={recentUserText}
        shouldAutoApprove={shouldAutoApprove}
        voiceContext={voiceContext}
        onRegenerate={onRegenerate}
        regeneratingAttemptIds={regeneratingAttemptIds}
      />

      {message.usage && !message.isStreaming && (
        <div className="flex justify-start pl-1">
          <span
            className="text-[11px] text-fg-muted"
            aria-label={`${message.usage.inputTokens + message.usage.outputTokens} tokens used`}
          >
            {message.usage.inputTokens + message.usage.outputTokens} tokens
          </span>
        </div>
      )}

      {/* [B3.4 / Gap J] Retry pill — rendered AFTER the timeline so it
          sits below the partial output. Visible only when the engine
          flagged this turn as interrupted. The replay click reopens
          the SSE stream with the original user message; React will
          then unmount this component as soon as the new turn writes
          a fresh assistant message. */}
      {message.interrupted && message.interruptedReplayText && onSendMessage && (
        <RetryInterruptedTurn
          replayText={message.interruptedReplayText}
          onRetry={onSendMessage}
        />
      )}
    </div>
  );
}
