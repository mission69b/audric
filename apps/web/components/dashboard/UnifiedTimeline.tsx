'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChatMessage } from '@/components/engine/ChatMessage';
import { ThinkingState } from '@/components/engine/ThinkingState';
import { ChatDivider } from '@/components/engine/ChatDivider';
import { SuggestedActions } from '@/components/engine/SuggestedAction';
import { FeedItemCard } from '@/components/dashboard/FeedRenderer';
import { deriveSuggestedActions } from '@/lib/suggested-actions';
import type { useEngine } from '@/hooks/useEngine';
import type { useFeed } from '@/hooks/useFeed';
import type { FeedItem } from '@/lib/feed-types';
import type { EngineChatMessage, PendingAction } from '@/lib/engine-types';

type EngineInstance = ReturnType<typeof useEngine>;
type FeedInstance = ReturnType<typeof useFeed>;

type TimelineEntry =
  | { kind: 'engine'; msg: EngineChatMessage }
  | { kind: 'feed'; item: FeedItem };

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
}: UnifiedTimelineProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

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
    async (action: PendingAction, approved: boolean) => {
      if (!approved || !onExecuteAction) {
        engine.resolveAction(action, approved);
        return;
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
    [engine.resolveAction, onExecuteAction],
  );

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
      {hasMessages && timeline.length > 0 && timeline[0].kind === 'engine' && timeline[0].msg.role === 'user' && (
        <ChatDivider label="TASK INITIATED" />
      )}

      {timeline.map((entry) => {
        if (entry.kind === 'engine') {
          if (showSkeleton && entry.msg.id === lastEngineMsg?.id) {
            return <ConnectingSkeleton key={entry.msg.id} />;
          }
          return (
            <ChatMessage
              key={entry.msg.id}
              message={entry.msg}
              onActionResolve={handleActionResolve}
            />
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
