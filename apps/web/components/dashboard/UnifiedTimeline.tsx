'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChatMessage } from '@/components/engine/ChatMessage';
import { QuickActions } from '@/components/engine/QuickActions';
import { FeedItemCard } from '@/components/dashboard/FeedRenderer';
import type { useEngine } from '@/hooks/useEngine';
import type { useFeed } from '@/hooks/useFeed';
import type { FeedItem } from '@/lib/feed-types';
import type { EngineChatMessage } from '@/lib/engine-types';

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
  email: string | null;
  onChipClick: (flow: string) => void;
  onCopy?: (text: string) => void;
  onSaveContact?: (name: string, address: string) => void;
  onConfirmResolve?: (approved: boolean) => void;
  onExecuteAction?: ExecuteActionFn;
}

function ConnectingSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" role="status" aria-label="Connecting to Audric">
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-border-bright border-t-foreground" />
          <span>Thinking...</span>
        </span>
      </div>
      <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3">
        <div className="h-3 w-2/3 rounded bg-border" />
      </div>
    </div>
  );
}

function getGreeting(email: string | null): string {
  const hour = new Date().getHours();
  const name = email?.split('@')[0] ?? '';
  const nameStr = name ? `, ${name}` : '';
  if (hour < 12) return `Good morning${nameStr}`;
  if (hour < 18) return `Good afternoon${nameStr}`;
  return `Good evening${nameStr}`;
}

export function UnifiedTimeline({
  engine,
  feed,
  email,
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

  const handlePermissionResolve = useCallback(
    async (permissionId: string, approved: boolean) => {
      if (!approved || !onExecuteAction) {
        engine.resolvePermission(permissionId, approved);
        return;
      }

      const msg = engine.messages.find((m) => m.permission?.permissionId === permissionId);
      if (!msg?.permission) {
        engine.resolvePermission(permissionId, approved);
        return;
      }

      try {
        const result = await onExecuteAction(msg.permission.toolName, msg.permission.input);
        engine.resolvePermission(permissionId, true, result.data);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Execution failed';
        engine.resolvePermission(permissionId, true, { success: false, error: errorMsg });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine.resolvePermission, engine.messages, onExecuteAction],
  );

  const isEmpty = engine.messages.length === 0 && feed.items.length === 0;
  const isConnecting = engine.status === 'connecting';
  const lastEngineMsg = engine.messages[engine.messages.length - 1];
  const showSkeleton = isConnecting && lastEngineMsg?.role === 'assistant' && !lastEngineMsg.content;

  return (
    <div className="space-y-3">
      {isEmpty && !engine.isStreaming && (
        <div className="flex flex-col items-center py-8 space-y-4">
          <p className="text-sm text-muted">{getGreeting(email)}</p>
          <QuickActions onSelect={handleQuickAction} disabled={engine.isStreaming} />
        </div>
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
              onPermissionResolve={handlePermissionResolve}
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
