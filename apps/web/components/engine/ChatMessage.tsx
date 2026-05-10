'use client';

import { useMemo } from 'react';
import type { EngineChatMessage, PendingAction } from '@/lib/engine-types';
import { ThinkingState } from './ThinkingState';
import { ReasoningTimeline } from './ReasoningTimeline';
import { RetryInterruptedTurn } from './RetryInterruptedTurn';
import { ConfirmChips } from './ConfirmChips';
import { TransitionChip, type TransitionState } from './timeline/primitives/TransitionChip';
import type { DenyReason } from './PermissionCard';
import type { HarnessVersion } from '@/lib/interactive-harness';
import { isConfirmChipsEnabled } from '@/lib/confirm-chips';
import { isTransitionChipEnabled } from '@/lib/harness-transitions';
import { useVoiceModeContext } from '@/components/dashboard/VoiceModeContext';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23A-P0 (2026-05-11) — Legacy harness rip
//
// ChatMessage was a renderer-selector that gated between v2's
// `<ReasoningTimeline>` and the pre-B2 `<LegacyReasoningRender>` based
// on a per-session pinned `harnessVersion`. Post-rip there is ONE
// renderer: v2. The component now:
//   1. Handles the user-bubble path (no version gating, no change).
//   2. Renders `<ReasoningTimeline>` for every assistant turn that
//      has a populated `message.timeline[]`.
//   3. Falls back to a minimal text block when `message.timeline` is
//      empty/undefined — a defensive surface for any rehydrated
//      message that pre-dates the engine's timeline dual-write
//      (engine ≥1.4.0 always emits a timeline; sessions older than
//      24h have aged out via Upstash TTL, so this is dead code in
//      practice, but cheaper to keep than to chase).
//
// The `pinnedHarnessVersion` prop is preserved on the interface for
// one release cycle so `<UnifiedTimeline>` doesn't need a coordinated
// edit; it's now ignored at the gate.
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
   * [SPEC 8 v0.5.1 B3.3 → SPEC 23A-P0, 2026-05-11] Per-session pinned
   * harness version. Pre-rip this gated between v2 and legacy renderers;
   * post-rip the legacy branch was deleted and the prop is ignored at
   * the gate. Kept on the interface for one release cycle so
   * `<UnifiedTimeline>` (which still passes it from `engine.harnessVersion`)
   * doesn't need a coordinated edit. Removes in the next minor along
   * with the `useEngine` state and the rest of the `HarnessVersion`
   * type chain.
   */
  pinnedHarnessVersion?: HarnessVersion | null;
  /**
   * [SPEC 7 P2.4b] Quote-Refresh handler — forwarded to the
   * `<PermissionCard>` slot in `<ReasoningTimeline>`. When omitted,
   * no Regenerate button appears even on bundles that support it
   * (parent has opted out of the feature).
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
   * [SPEC 9 v0.1.3 P9.4] Inline-form submit handler — wired up from
   * `engine.handlePendingInputSubmit`. Forwarded to
   * `<ReasoningTimeline>` → `<BlockRouter>` → `<PendingInputBlockView>`.
   */
  onPendingInputSubmit?: (inputId: string, values: Record<string, unknown>) => void;
  /**
   * [S.123 v0.55.x] Forwarded to `<ReasoningTimeline>` →
   * `<BundleReceiptBlockView>` for the inline "Sign back in" recovery
   * button on session-expired bundle receipts. Wired to
   * `useZkLogin.refresh` at the dashboard.
   */
  onSignBackIn?: () => void;
  /**
   * [SPEC 21.3] Last 3 assistant turns' thinking text content from
   * earlier messages in the session — passed down to ReasoningTimeline
   * for the similarity-collapse decision. Computed once per render in
   * `<UnifiedTimeline>` from the message graph. Default: undefined →
   * no collapse comparison data → render normally.
   */
  priorThinkingTexts?: ReadonlyArray<string>;
  /**
   * [SPEC 21.3] First-turn carve-out flag — true when this is the first
   * assistant message in the session. Default: undefined → false.
   */
  isFirstAssistantTurn?: boolean;
}

export function ChatMessage({
  message,
  onActionResolve,
  shouldAutoApprove,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
  // pinnedHarnessVersion is intentionally ignored post-SPEC-23A-P0 —
  // see the prop doc-comment. Destructured here only so callers don't
  // get `unknown prop` warnings during the deprecation cycle.
  pinnedHarnessVersion: _pinnedHarnessVersion,
  onRegenerate,
  regeneratingAttemptIds,
  onChipDecision,
  onPendingInputSubmit,
  onSignBackIn,
  priorThinkingTexts,
  isFirstAssistantTurn,
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

  // [SPEC 15 Phase 2 commit 2] Chip render. Three gates, all required:
  //   1. Server emitted `expects_confirm` for this message → payload set.
  //   2. Frontend env flag NEXT_PUBLIC_CONFIRM_CHIPS_V1 is "1"/"true".
  //   3. Caller wired up `onChipDecision` (auth/demo split — unauth
  //      sessions can't dispatch bundles anyway, no need to render).
  // Stops streaming = chips lock once the next assistant turn starts.
  //
  // [v0.7 — Refresh chip removed, 2026-05-04] On expiry the chip
  // shows "Quote expired — ask for a fresh one" and the user retypes.
  // PermissionCard regenerate covers post-dispatch quote refresh on
  // confirm-tier writes. See `SPEC_15_PHASE2_DESIGN.md` v0.7.
  const chipsBlock =
    message.expectsConfirm &&
    onChipDecision &&
    isConfirmChipsEnabled() &&
    !message.isStreaming ? (
      <ConfirmChips
        payload={message.expectsConfirm}
        onChipDecision={onChipDecision}
      />
    ) : null;

  const hasTimeline = !!(message.timeline && message.timeline.length > 0);
  const hasTools = !!(message.tools && message.tools.length > 0);

  if (hasTimeline) {
    return (
      <>
        <ChatMessageV2
          message={message}
          hasTools={hasTools}
          onActionResolve={onActionResolve}
          onSendMessage={onSendMessage}
          contacts={contacts}
          walletAddress={walletAddress}
          recentUserText={recentUserText}
          shouldAutoApprove={shouldAutoApprove}
          onRegenerate={onRegenerate}
          regeneratingAttemptIds={regeneratingAttemptIds}
          onPendingInputSubmit={onPendingInputSubmit}
          onSignBackIn={onSignBackIn}
          priorThinkingTexts={priorThinkingTexts}
          isFirstAssistantTurn={isFirstAssistantTurn}
        />
        {chipsBlock}
      </>
    );
  }

  // Defensive: assistant message with no timeline. Engine ≥1.4.0 dual-
  // writes a timeline for every message, and Upstash sessions all aged
  // out within 24h, so this branch is unreachable in practice. Render
  // the bare text content + retry pill so we never silently drop
  // output if the invariant ever breaks.
  return (
    <>
      <div className="space-y-2" role="log" aria-label="Audric response">
        {message.isThinking && !message.content && !hasTools && (
          <div className="pl-1">
            <ThinkingState status="thinking" intensity="active" />
          </div>
        )}
        {message.content && (
          <div className="pl-1 text-sm text-fg-default whitespace-pre-wrap">
            {message.content}
          </div>
        )}
      </div>
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
// the v2 path. Pre-SPEC-23A-P0 the legacy branch had its own
// `useVoiceModeContext` call inside `<LegacyReasoningRender>`; the
// extraction kept the React hook tree stable per branch. Post-rip
// there's only one branch but we keep the sub-component split to
// avoid churning the voice-mode test fixtures.
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
  onPendingInputSubmit,
  onSignBackIn,
  priorThinkingTexts,
  isFirstAssistantTurn,
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

  // [SPEC 21.1] Pull the chip flag at render time. Stateless — flipping
  // mid-session takes effect on the next assistant turn that emits a
  // stream_state event. `transitionState` is set by useEngine.ts in
  // response to engine-emitted `routing` / `quoting` and audric-emitted
  // `confirming` / `settling` / `done`.
  const transitionsEnabled = isTransitionChipEnabled();
  const transitionState = (message.transitionState ?? null) as TransitionState | null;

  return (
    <div className="space-y-2" role="log" aria-label="Audric response">
      {/* [SPEC 21.1] Animated state chip — renders ABOVE the timeline so
          it sits at the top of the assistant message body, replacing the
          old "TASK INITIATED → silence → giant block" pattern with a
          single morphing chip that crossfades through routing → quoting
          → confirming → settling → done. */}
      {transitionsEnabled && transitionState && (
        <TransitionChip state={transitionState} />
      )}

      {/* Same "thinking-only" spinner the renderer falls back to before
          the first SSE event arrives (timeline doesn't render anything
          until the first event lands). */}
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
        onPendingInputSubmit={onPendingInputSubmit}
        onSignBackIn={onSignBackIn}
        priorThinkingTexts={priorThinkingTexts}
        isFirstAssistantTurn={isFirstAssistantTurn}
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
