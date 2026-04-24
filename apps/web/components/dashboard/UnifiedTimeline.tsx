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
import { deriveSuggestedActions } from '@/lib/suggested-actions';
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
) => Promise<{ success: boolean; data: unknown }>;

interface UnifiedTimelineProps {
  engine: EngineInstance;
  feed: FeedInstance;
  onChipClick: (flow: string) => void;
  onCopy?: (text: string) => void;
  onSaveContact?: (name: string, address: string) => void;
  onConfirmResolve?: (approved: boolean) => void;
  onExecuteAction?: ExecuteActionFn;
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
  /**
   * Persists a contact BEFORE a `send_transfer` is broadcast. Threaded
   * through to PermissionCard's inline "Save as contact" affordance.
   * `dashboard-content` wires this to `useContacts.addContact`, which
   * also writes through to `/api/user/preferences`.
   */
  onSaveContactBeforeApprove?: (name: string, address: string) => Promise<void> | void;
  /** Wallet address — required to render the in-chat Copilot pill (Wave C.5)
   *  and the InChatSurface card (Wave C.6). */
  address?: string | null;
  /** zkLogin JWT — required to render the in-chat Copilot surface (C.5/C.6). */
  jwt?: string | null;
  /** Engine session id — used to dedup the InChatSurface card per session. */
  sessionId?: string | null;
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
  onConfirmResolve,
  onExecuteAction,
  onValidateAction,
  agentBudget = 0,
  permissionConfig = DEFAULT_PERMISSION_CONFIG,
  priceCache,
  onSendMessage,
  contacts = [],
  onSaveContactBeforeApprove,
  address = null,
  jwt = null,
  sessionId = null,
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
  const shouldAutoApprove = useCallback(
    (action: Pick<PendingAction, 'toolName' | 'input'>) =>
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
      if (!approved || !onExecuteAction) {
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

      try {
        const result = await onExecuteAction(action.toolName, effectiveInput);
        engine.resolveAction(action, true, result.data, undefined, modifications);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Execution failed';
        engine.resolveAction(
          action,
          true,
          { success: false, error: errorMsg },
          undefined,
          modifications,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine.resolveAction, onExecuteAction, onValidateAction],
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
  const showSuggestions =
    !engine.isStreaming &&
    lastEngineMsg?.role === 'assistant' &&
    !lastEngineMsg.isStreaming &&
    !lastEngineMsg.pendingAction &&
    lastEngineMsg.content.length > 0;

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
                onSaveContactBeforeApprove={onSaveContactBeforeApprove}
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
            onConfirmResolve={onConfirmResolve}
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
