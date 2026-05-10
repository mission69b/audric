'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChatMessage } from '@/components/engine/ChatMessage';
import { ThinkingState } from '@/components/engine/ThinkingState';
import { ChatDivider } from '@/components/engine/ChatDivider';
import { SuggestedActions } from '@/components/engine/SuggestedAction';
import { FeedItemCard } from '@/components/dashboard/FeedRenderer';
// [SIMPLIFICATION DAY 5] CopilotPill + InChatSurface deleted with the
// Copilot stack. The render tree was already short-circuited in S.3 — the
// imports are now removed.
import { deriveSuggestedActions, endsWithQuestion } from '@/lib/suggested-actions';
import type { useEngine } from '@/hooks/useEngine';
import type { useFeed } from '@/hooks/useFeed';
import type { FeedItem } from '@/lib/feed-types';
import type { EngineChatMessage, PendingAction } from '@/lib/engine-types';
import type { DenyReason } from '@/components/engine/PermissionCard';
import {
  shouldClientAutoApprove,
  DEFAULT_PERMISSION_CONFIG,
  type UserPermissionConfig,
} from '@/lib/engine/permission-tiers-client';
import { buildBundleRevertedError } from '@/hooks/executeToolAction';

type EngineInstance = ReturnType<typeof useEngine>;
type FeedInstance = ReturnType<typeof useFeed>;

type TimelineEntry =
  | { kind: 'engine'; msg: EngineChatMessage }
  | { kind: 'feed'; item: FeedItem };

// [v1.4 hotfix] The previous hardcoded `AUTO_APPROVE_TOOLS` set ignored
// the user's safety preset and amount, so every save/withdraw/etc.
// auto-executed regardless of value — even though the engine yielded a
// `pending_action` for each. Replaced by `shouldClientAutoApprove`,
// which honors the engine's tier semantics. See
// `apps/web/lib/engine/permission-tiers-client.ts`.

export type ExecuteActionFn = (
  toolName: string,
  input: unknown,
  /**
   * [SPEC 20.2 / D-1 (a)] Optional precomputed Cetus route attached to
   * this pending_action by the engine. When present, the prepare-route
   * uses it as the fast-path (skips ~400-500ms findSwapRoute()). Audric
   * passes `action.cetusRoute` through unchanged; the SDK + prepare route
   * own the freshness + structural verification (D-2 + D-3). Pre-SPEC-20.2
   * sessions (or non-swap actions) leave this undefined → legacy fallback.
   */
  cetusRoute?: unknown,
) => Promise<{ success: boolean; data: unknown }>;

/**
 * [SPEC 7 P2.4 Layer 3] Multi-write Payment Intent executor. Caller
 * dispatches `sdk.executeBundle(steps)` and returns per-step results
 * mapped from the shared tx digest. Engine matches each step's
 * `toolUseId` to its result on resume and emits N tool_result blocks.
 * Atomic semantics: on revert, every step's `isError: true` with the
 * same root error so the LLM narrates "the bundle reverted" coherently.
 */
export type ExecuteBundleFn = (
  action: PendingAction,
) => Promise<{
  success: boolean;
  txDigest?: string;
  stepResults: Array<{
    toolUseId: string;
    attemptId: string;
    result: unknown;
    isError: boolean;
  }>;
  error?: string;
}>;

interface UnifiedTimelineProps {
  engine: EngineInstance;
  feed: FeedInstance;
  onChipClick: (flow: string) => void;
  onCopy?: (text: string) => void;
  onSaveContact?: (name: string, address: string) => void;
  /** Remove a feed item by id. Required for dismissable cards (contact-prompt). */
  onDismissItem?: (id: string) => void;
  onConfirmResolve?: (approved: boolean) => void;
  onExecuteAction?: ExecuteActionFn;
  /**
   * [SPEC 7 P2.4 Layer 3] Multi-write bundle executor. When set, bundle-
   * shaped pending actions (`action.steps?.length > 0`) dispatch through
   * this instead of `onExecuteAction`. Both single-write and bundle paths
   * coexist; the discriminator is the presence of `action.steps`.
   */
  onExecuteBundle?: ExecuteBundleFn;
  /** Pre-flight balance check. Returns error string if insufficient, null if OK. */
  onValidateAction?: (toolName: string, input: unknown) => string | null;
  /** Max USD amount to auto-approve without user confirmation (0 = always confirm). */
  agentBudget?: number;
  /**
   * [v1.4 hotfix] User's resolved permission config (one of the
   * conservative/balanced/aggressive presets). Required for the
   * tier-aware auto-approve gate. Falls back to `balanced` defaults
   * if omitted so dev surfaces don't crash, but production callers
   * MUST pass this through.
   */
  permissionConfig?: UserPermissionConfig;
  /**
   * [v1.4 hotfix] Symbol → USD price map used by `resolveUsdValue` to
   * value non-USDC writes (SUI swaps, transfers). USDC/USDT are pinned
   * to 1 inside the resolver — callers only need to provide non-stable
   * prices. Missing symbols fail safe (Infinity → confirm).
   */
  priceCache?: Map<string, number>;
  /** Send a message on behalf of the user from canvas in-canvas actions. */
  onSendMessage?: (text: string) => void;
  /**
   * Saved contacts for the current user. Threaded into
   * `shouldClientAutoApprove` so a `send_transfer` to a raw 0x address
   * with no contact match always shows the PermissionCard, regardless
   * of amount or preset. Closes the "LLM-typed address silently ships
   * funds" failure mode at the gate, not just at the card.
   */
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  /** Wallet address — required to render the in-chat Copilot pill (Wave C.5)
   *  and the InChatSurface card (Wave C.6). */
  address?: string | null;
  /** zkLogin JWT — required to render the in-chat Copilot surface (C.5/C.6). */
  jwt?: string | null;
  /** Engine session id — used to dedup the InChatSurface card per session. */
  sessionId?: string | null;
  /**
   * [B3 polish G4] Read-only contacts check threaded into the
   * transaction-history rows so incoming-from-stranger rows can render
   * a save-sender `+` affordance.
   */
  isKnownAddress?: (addr: string) => boolean;
  /**
   * [B3 polish G4] Click handler for the save-sender affordance —
   * parent (dashboard-content.tsx) spawns a `contact-prompt` feed
   * item with the sender's address, reusing B4's ContactToast for
   * the actual save UI.
   */
  onPromptSaveSender?: (address: string) => void;
  /**
   * [S.123 v0.55.x] Self-healing zkLogin recovery — wired to
   * `useZkLogin.refresh` at the dashboard. Forwarded down to
   * `<BundleReceiptBlockView>` for its inline "Sign back in" button on
   * session-expired bundle receipts. Without this, users hit by an
   * expired JWT mid-bundle had no way to recover except telling the
   * agent to "logout" — which was hallucinated (no real logout tool)
   * and left them stuck (Teo / Mysten Labs report).
   */
  onSignBackIn?: () => void;
}

function ConnectingSkeleton() {
  return (
    <div className="pl-1" role="status" aria-label="Connecting to Audric">
      <ThinkingState status="awakening" intensity="active" />
    </div>
  );
}

export function UnifiedTimeline({
  engine,
  feed,
  onChipClick,
  onCopy,
  onSaveContact,
  onDismissItem,
  onConfirmResolve,
  onExecuteAction,
  onExecuteBundle,
  onValidateAction,
  agentBudget = 0,
  permissionConfig = DEFAULT_PERMISSION_CONFIG,
  priceCache,
  onSendMessage,
  contacts = [],
  address = null,
  jwt = null,
  sessionId = null,
  isKnownAddress,
  onPromptSaveSender,
  onSignBackIn,
}: UnifiedTimelineProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const autoApprovedRef = useRef(new Set<string>());

  // [v1.4 hotfix] Single client-side gate consulted by both the
  // auto-resolve effect below and the <ChatMessage> render. The
  // server-side `/api/engine/resume` route is the source of truth for
  // the cumulative daily cap (it reads/writes Redis via
  // session-spend.ts). We track the same counter client-side as a
  // mirror so the UI starts surfacing confirmation cards as the
  // session approaches the cap, without waiting for a round-trip.
  const resolvedPriceCache = useMemo(
    () => priceCache ?? new Map<string, number>([['USDC', 1], ['USDT', 1]]),
    [priceCache],
  );
  const sessionSpendRef = useRef(0);
  // [F14-fix-2 / 2026-05-03] Type signature MUST include `steps`. The
  // bundle iteration in `shouldClientAutoApprove` only runs when
  // `Array.isArray(action.steps) && action.steps.length >= 2`. Without
  // `steps` in the type, callers can silently strip it at the callsite
  // (the bug we just fixed in `PermissionCardBlockView.tsx:74`) and the
  // gate degrades to single-step (step[0]-only) semantics. Mirrors the
  // tightened prop types on `PermissionCardBlockView` so the type
  // system catches a regression at every consumer.
  // [SPEC 23A-P0 2026-05-11] `LegacyReasoningRender` was deleted in
  // the legacy harness rip; only the v2 path's prop type remains here.
  const shouldAutoApprove = useCallback(
    (action: Pick<PendingAction, 'toolName' | 'input' | 'steps'>) =>
      shouldClientAutoApprove(
        action,
        permissionConfig,
        sessionSpendRef.current,
        resolvedPriceCache,
        agentBudget,
        contacts,
      ),
    [permissionConfig, resolvedPriceCache, agentBudget, contacts],
  );

  // [SIMPLIFICATION DAY 3] address/jwt/sessionId previously fed the in-chat
  // Copilot surfaces (InChatSurface card + CopilotPill). Both are removed.
  // Props stay on the interface so callers (DashboardContent, ChatSession)
  // don't need to change yet — Day 6 narrows the surface area.
  void jwt;
  void sessionId;

  // [send-safety] Last 10 user messages, concatenated. Lets PermissionCard
  // render the "Address from your message" badge for raw-address sends
  // when the recipient appears verbatim in the conversation. Mirrors the
  // 10-turn window the engine's `guardAddressSource` uses, so the badge
  // is consistent with the server-side accept/reject decision.
  const recentUserText = useMemo(() => {
    const userMsgs = engine.messages.filter((m) => m.role === 'user');
    return userMsgs.slice(-10).map((m) => m.content).join('\n');
  }, [engine.messages]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: (TimelineEntry & { ts: number })[] = [];
    for (const msg of engine.messages) {
      entries.push({ kind: 'engine', msg, ts: msg.timestamp });
    }
    for (const item of feed.items) {
      entries.push({ kind: 'feed', item, ts: item.timestamp });
    }
    entries.sort((a, b) => a.ts - b.ts);
    return entries;
  }, [engine.messages, feed.items]);

  const totalCount = timeline.length;

  useEffect(() => {
    if (totalCount > lastCount.current) {
      requestAnimationFrame(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
      lastCount.current = totalCount;
    }
  }, [totalCount]);

  const lastMsgContentLen = engine.messages[engine.messages.length - 1]?.content.length;
  useEffect(() => {
    if (engine.isStreaming) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [engine.isStreaming, lastMsgContentLen]);

  const handleQuickAction = useCallback(
    (prompt: string) => engine.sendMessage(prompt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine.sendMessage],
  );

  const handleActionResolve = useCallback(
    async (
      action: PendingAction,
      approved: boolean,
      reason?: DenyReason,
      // [v1.4 Item 6] User-edited fields from PermissionCard. When set,
      // overlay them on action.input before execution and forward to the
      // resume route so server-side history matches the approved values.
      modifications?: Record<string, unknown>,
    ) => {
      // [SPEC 7 P2.4 Layer 3] Bundle vs single-write dispatch. The engine
      // emits `action.steps` for multi-write Payment Intents (>=2
      // confirm-tier writes with `bundleable: true` resolved in the same
      // turn). Single writes leave `steps` undefined.
      const isBundle = Array.isArray(action.steps) && action.steps.length > 0;

      if (!approved) {
        engine.resolveAction(action, approved, undefined, reason);
        return;
      }

      if (isBundle) {
        if (!onExecuteBundle) {
          // No bundle executor wired → cannot proceed. Surface as
          // pre-execute failure so the LLM narrates the host bug
          // rather than silently dropping the approval.
          const errorResults = action.steps!.map((s) => ({
            toolUseId: s.toolUseId,
            attemptId: s.attemptId,
            result: { success: false, error: 'Bundle executor unavailable on this host' },
            isError: true,
          }));
          engine.resolveAction(
            action,
            true,
            undefined,
            undefined,
            modifications,
            undefined,
            errorResults,
          );
          return;
        }

        const executionStart = Date.now();
        try {
          const bundleResult = await onExecuteBundle(action);
          const executionDurationMs = Date.now() - executionStart;
          engine.resolveAction(
            action,
            true,
            undefined,
            undefined,
            modifications,
            executionDurationMs,
            bundleResult.stepResults,
          );
        } catch (err) {
          const executionDurationMs = Date.now() - executionStart;
          const errorMsg = err instanceof Error ? err.message : 'Bundle execution failed';
          // Synthesize per-step error results from the thrown error so
          // every step gets a tool_result block on resume (atomic
          // semantics). Mirrors executeBundleAction's catch path for
          // when the executor itself throws synchronously before the
          // SDK call lands.
          //
          // [Bug B fix / 2026-05-10] Use buildBundleRevertedError to
          // prefix the error with strong inline narration directives —
          // matches the executeBundleAction primary path so the LLM
          // gets a uniform "BUNDLE REVERTED — NOTHING EXECUTED" anchor
          // regardless of which catch branch fires.
          const errorResults = action.steps!.map((s) => ({
            toolUseId: s.toolUseId,
            attemptId: s.attemptId,
            result: { success: false, error: buildBundleRevertedError(errorMsg), _bundleReverted: true },
            isError: true,
          }));
          engine.resolveAction(
            action,
            true,
            undefined,
            undefined,
            modifications,
            executionDurationMs,
            errorResults,
          );
        }
        return;
      }

      // ─── Single-write path (legacy, unchanged) ─────────────────────
      if (!onExecuteAction) {
        engine.resolveAction(action, approved, undefined, reason);
        return;
      }

      const effectiveInput =
        modifications && Object.keys(modifications).length
          ? action.input && typeof action.input === 'object'
            ? { ...(action.input as Record<string, unknown>), ...modifications }
            : modifications
          : action.input;

      if (onValidateAction) {
        const validationError = onValidateAction(action.toolName, effectiveInput);
        if (validationError) {
          engine.resolveAction(
            action,
            true,
            { success: false, error: validationError },
            undefined,
            modifications,
          );
          return;
        }
      }

      // [v1.4.2 — Day 4 / Spec m1] Measure wall-clock ms around the
      // client-side execution (signing + broadcast + indexer-lag
      // absorption) and forward to the engine resume route so the
      // matching `TurnMetrics` row's `writeToolDurationMs` is
      // populated. Both success and failure paths report a duration —
      // the column carries "how long the user waited" regardless of
      // outcome, which is what dashboard p95s want.
      const executionStart = Date.now();
      try {
        // [SPEC 20.2 / D-1 (a)] Forward the engine-emitted cetusRoute so
        // the prepare-route can use it as the fast-path (skip Cetus route
        // discovery). Undefined for non-swap actions and pre-SPEC-20.2
        // sessions (legacy dual-path fallback per D-5).
        const result = await onExecuteAction(action.toolName, effectiveInput, action.cetusRoute);
        const executionDurationMs = Date.now() - executionStart;
        engine.resolveAction(
          action,
          true,
          result.data,
          undefined,
          modifications,
          executionDurationMs,
        );
      } catch (err) {
        const executionDurationMs = Date.now() - executionStart;
        const errorMsg = err instanceof Error ? err.message : 'Execution failed';
        engine.resolveAction(
          action,
          true,
          { success: false, error: errorMsg },
          undefined,
          modifications,
          executionDurationMs,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine.resolveAction, onExecuteAction, onExecuteBundle, onValidateAction],
  );

  useEffect(() => {
    const lastMsg = engine.messages[engine.messages.length - 1];
    const action = lastMsg?.pendingAction;
    if (!action || !onExecuteAction) return;
    if (autoApprovedRef.current.has(action.toolUseId)) return;

    // [v1.4 hotfix] Tier-aware auto-approve. The previous implementation
    // checked a hardcoded set + a single agentBudget threshold; both
    // ignored the user's safety preset. `shouldClientAutoApprove` now
    // honors preset thresholds, the daily-cap counter, AND the explicit
    // agentBudget — see `permission-tiers-client.ts`.
    if (shouldAutoApprove(action)) {
      autoApprovedRef.current.add(action.toolUseId);
      // Mirror the server-side cumulative spend so subsequent writes
      // in this session correctly downgrade once the daily cap is hit.
      const usd = Number(
        (action.input as Record<string, unknown> | null | undefined)?.amount,
      );
      if (Number.isFinite(usd) && usd > 0) {
        sessionSpendRef.current += usd;
      }
      handleActionResolve(action, true);
      return;
    }

    // Manual-approve path: pre-flight balance check — auto-deny early if
    // the wallet can't cover the amount, so the user isn't asked to
    // confirm something that will fail.
    if (onValidateAction) {
      const validationError = onValidateAction(action.toolName, action.input);
      if (validationError) {
        autoApprovedRef.current.add(action.toolUseId);
        engine.resolveAction(action, true, { success: false, error: validationError });
      }
    }
  }, [engine.messages, onExecuteAction, handleActionResolve, onValidateAction, engine, shouldAutoApprove]);

  const isConnecting = engine.status === 'connecting';
  const lastEngineMsg = engine.messages[engine.messages.length - 1];
  const showSkeleton = isConnecting && lastEngineMsg?.role === 'assistant' && !lastEngineMsg.content;

  const hasMessages = engine.messages.length > 0;

  // [SPEC 21.3] Pre-compute, per assistant message in the session, the
  // last-3 thinking-text strings drawn from EARLIER assistant messages
  // (so the current message's own thinking isn't compared against itself).
  // This map is the input to ReasoningTimeline's per-block similarity
  // collapse decision. Computed once per render; cheap because it walks
  // the messages array once and only inspects timeline blocks of type
  // 'thinking'. Cross-message comparison is the only state needed —
  // intra-message error-recovery is detected inside ReasoningTimeline
  // by inspecting the IMMEDIATELY preceding block.
  const priorThinkingTextsByMessageId = useMemo(() => {
    const map = new Map<string, ReadonlyArray<string>>();
    const allAssistantThinkingTextsInOrder: string[] = [];
    let firstAssistantSeen = false;
    for (const msg of engine.messages) {
      if (msg.role !== 'assistant') continue;
      const isFirstAssistant = !firstAssistantSeen;
      firstAssistantSeen = true;
      // Snapshot the priors BEFORE pushing this message's thinking — keep
      // the last 3 (oldest→newest within the window) so the helper has a
      // bounded comparison set per the SPEC 21.3 contract.
      map.set(msg.id, allAssistantThinkingTextsInOrder.slice(-3));
      // First-turn carve-out is plumbed via a parallel map below; this
      // map only carries the prior texts.
      void isFirstAssistant;
      // Append THIS message's thinking text(s) so the next iteration sees
      // them as priors. A message may contain ≥1 thinking blocks; we
      // include each as a separate entry — they're emitted at distinct
      // turn boundaries from the LLM's perspective.
      if (Array.isArray(msg.timeline)) {
        for (const block of msg.timeline) {
          if (block.type === 'thinking' && block.text.trim().length > 0) {
            allAssistantThinkingTextsInOrder.push(block.text);
          }
        }
      }
    }
    return map;
  }, [engine.messages]);
  // Companion map: which assistant messages are the FIRST-OF-SESSION carve-out.
  const firstAssistantMessageId = useMemo(() => {
    for (const msg of engine.messages) {
      if (msg.role === 'assistant') return msg.id;
    }
    return null;
  }, [engine.messages]);
  // [F15 / 2026-05-03] Suppress chips when the assistant just asked a
  // question — the answer is yes/no/clarification, not a new prompt.
  // See `endsWithQuestion` JSDoc in `lib/suggested-actions.ts` for the
  // 6-op repro.
  const showSuggestions =
    !engine.isStreaming &&
    lastEngineMsg?.role === 'assistant' &&
    !lastEngineMsg.isStreaming &&
    !lastEngineMsg.pendingAction &&
    lastEngineMsg.content.length > 0 &&
    !endsWithQuestion(lastEngineMsg.content);

  const suggestedActions = showSuggestions
    ? deriveSuggestedActions(lastEngineMsg?.tools)
    : [];

  return (
    <div className="space-y-3">
      {/* [SIMPLIFICATION DAY 3] In-chat Copilot suggestion card and the
          "N suggestions waiting" pill are removed. Copilot suggestions
          (`CopilotSuggestion` rows + the Stage-2/3 pattern stack) are
          retired — Audric is chat-first now. Day 6 deletes the
          InChatSurface, CopilotPill, useInChatSurface, useCopilotSuggestions
          hooks, and the suggestion API routes once we confirm no other
          callers depend on them. */}
      {hasMessages && (
        <>
          {/* InChatSurface and CopilotPill removed — see comment above. */}
        </>
      )}
      {timeline.map((entry) => {
        if (entry.kind === 'engine') {
          if (showSkeleton && entry.msg.id === lastEngineMsg?.id) {
            return <ConnectingSkeleton key={entry.msg.id} />;
          }
          const isUser = entry.msg.role === 'user';
          return (
            <div key={entry.msg.id}>
              {isUser && <ChatDivider label="TASK INITIATED" />}
              <ChatMessage
                message={entry.msg}
                onActionResolve={handleActionResolve}
                shouldAutoApprove={shouldAutoApprove}
                onSendMessage={onSendMessage ?? engine.sendMessage}
                contacts={contacts}
                walletAddress={address}
                recentUserText={recentUserText}
                pinnedHarnessVersion={engine.harnessVersion}
                onRegenerate={engine.handleRegenerate}
                regeneratingAttemptIds={engine.regeneratingAttemptIds}
                onChipDecision={engine.sendChipDecision}
                onPendingInputSubmit={engine.handlePendingInputSubmit}
                onSignBackIn={onSignBackIn}
                // [SPEC 21.3] Cross-message thinking-similarity inputs.
                // priorThinkingTexts is the last 3 turns' thinking text
                // (drawn from earlier assistant messages); the first
                // assistant message of the session gets the carve-out
                // flag so its thinking always renders fully.
                priorThinkingTexts={priorThinkingTextsByMessageId.get(entry.msg.id)}
                isFirstAssistantTurn={entry.msg.id === firstAssistantMessageId}
              />
            </div>
          );
        }
        return (
          <FeedItemCard
            key={entry.item.id}
            item={entry.item}
            onChipClick={onChipClick}
            onCopy={onCopy}
            onSaveContact={onSaveContact}
            onDismissItem={onDismissItem}
            onConfirmResolve={onConfirmResolve}
            isKnownAddress={isKnownAddress}
            onPromptSaveSender={onPromptSaveSender}
          />
        );
      })}

      {suggestedActions.length > 0 && (
        <div className="pl-1">
          <SuggestedActions
            actions={suggestedActions}
            onSelect={handleQuickAction}
            disabled={engine.isStreaming}
          />
        </div>
      )}

      {engine.error && !engine.isStreaming && (
        <div
          className="rounded-lg bg-error-solid/5 border border-error-solid/20 px-4 py-3 text-sm flex items-center justify-between gap-2"
          role="alert"
        >
          <span className="text-error-solid">{engine.error}</span>
          <div className="flex gap-2 shrink-0">
            {engine.canRetry && (
              <button
                onClick={engine.retry}
                className="rounded-lg border border-error-solid/30 px-3 py-1 text-xs text-error-solid hover:bg-error-solid/5 transition"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
