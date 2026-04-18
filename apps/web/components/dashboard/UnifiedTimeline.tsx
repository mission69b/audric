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

type EngineInstance = ReturnType<typeof useEngine>;
type FeedInstance = ReturnType<typeof useFeed>;

type TimelineEntry =
  | { kind: 'engine'; msg: EngineChatMessage }
  | { kind: 'feed'; item: FeedItem };

const AUTO_APPROVE_TOOLS = new Set([
  'save_deposit', 'withdraw', 'repay_debt', 'claim_rewards',
  'volo_stake', 'volo_unstake', 'pay_api', 'save_contact',
]);

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
  /** Send a message on behalf of the user from canvas in-canvas actions. */
  onSendMessage?: (text: string) => void;
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

function extractAmount(input: unknown): number {
  if (!input || typeof input !== 'object') return Infinity;
  const inp = input as Record<string, unknown>;
  if (typeof inp.amount === 'number') return inp.amount;
  if (typeof inp.maxPrice === 'number') return inp.maxPrice;
  return Infinity;
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
  onSendMessage,
  address = null,
  jwt = null,
  sessionId = null,
}: UnifiedTimelineProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const autoApprovedRef = useRef(new Set<string>());

  // [SIMPLIFICATION DAY 3] address/jwt/sessionId previously fed the in-chat
  // Copilot surfaces (InChatSurface card + CopilotPill). Both are removed.
  // Props stay on the interface so callers (DashboardContent, ChatSession)
  // don't need to change yet — Day 6 narrows the surface area.
  void address;
  void jwt;
  void sessionId;

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
    async (action: PendingAction, approved: boolean, reason?: DenyReason) => {
      if (!approved || !onExecuteAction) {
        engine.resolveAction(action, approved, undefined, reason);
        return;
      }

      // Pre-flight balance validation — reject before executing
      if (onValidateAction) {
        const validationError = onValidateAction(action.toolName, action.input);
        if (validationError) {
          engine.resolveAction(action, true, { success: false, error: validationError });
          return;
        }
      }

      try {
        const result = await onExecuteAction(action.toolName, action.input);
        engine.resolveAction(action, true, result.data);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Execution failed';
        engine.resolveAction(action, true, { success: false, error: errorMsg });
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

    // Auto-approve tools: validate then execute immediately
    if (AUTO_APPROVE_TOOLS.has(action.toolName)) {
      autoApprovedRef.current.add(action.toolUseId);
      handleActionResolve(action, true);
      return;
    }

    // Budget-based auto-approve: if amount <= agentBudget, approve without confirmation
    if (agentBudget > 0 && extractAmount(action.input) <= agentBudget) {
      autoApprovedRef.current.add(action.toolUseId);
      handleActionResolve(action, true);
      return;
    }

    // Manual-approve tools: pre-flight balance check — auto-deny if insufficient
    if (onValidateAction) {
      const validationError = onValidateAction(action.toolName, action.input);
      if (validationError) {
        autoApprovedRef.current.add(action.toolUseId);
        engine.resolveAction(action, true, { success: false, error: validationError });
      }
    }
  }, [engine.messages, onExecuteAction, handleActionResolve, onValidateAction, engine, agentBudget]);

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
                autoApproveTools={AUTO_APPROVE_TOOLS}
                agentBudget={agentBudget}
                onSendMessage={onSendMessage ?? engine.sendMessage}
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
          className="rounded-lg bg-error/5 border border-error/20 px-4 py-3 text-sm flex items-center justify-between gap-2"
          role="alert"
        >
          <span className="text-error">{engine.error}</span>
          <div className="flex gap-2 shrink-0">
            {engine.canRetry && (
              <button
                onClick={engine.retry}
                className="rounded-lg border border-error/30 px-3 py-1 text-xs text-error hover:bg-error/5 transition"
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
