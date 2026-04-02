'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { QuickActions } from './QuickActions';
import { ThinkingState } from './ThinkingState';
import { ChatDivider } from './ChatDivider';
import { SuggestedActions } from './SuggestedAction';
import { deriveSuggestedActions } from '@/lib/suggested-actions';
import type { useEngine } from '@/hooks/useEngine';

type EngineInstance = ReturnType<typeof useEngine>;

interface EngineChatProps {
  engine: EngineInstance;
  email: string | null;
  onSendMessage?: (text: string) => void;
}

function ConnectingSkeleton() {
  return (
    <div className="pl-1" role="status" aria-label="Connecting to Audric">
      <ThinkingState status="awakening" intensity="active" />
    </div>
  );
}

export function EngineChat({ engine, email, onSendMessage }: EngineChatProps) {
  const feedEndRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);

  useEffect(() => {
    if (engine.messages.length > lastMsgCount.current) {
      requestAnimationFrame(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
      lastMsgCount.current = engine.messages.length;
    }
  }, [engine.messages.length]);

  useEffect(() => {
    if (engine.isStreaming) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [engine.isStreaming, engine.messages[engine.messages.length - 1]?.content.length]);

  const handleQuickAction = useCallback(
    (prompt: string) => {
      engine.sendMessage(prompt);
    },
    [engine.sendMessage],
  );

  const handleActionResolve = useCallback(
    (action: Parameters<typeof engine.resolveAction>[0], approved: boolean) => {
      engine.resolveAction(action, approved);
    },
    [engine.resolveAction],
  );

  const handleSuggestedAction = useCallback(
    (prompt: string) => {
      if (onSendMessage) {
        onSendMessage(prompt);
      } else {
        engine.sendMessage(prompt);
      }
    },
    [engine.sendMessage, onSendMessage],
  );

  const isEmpty = engine.messages.length === 0;
  const greeting = getGreeting(email);
  const isConnecting = engine.status === 'connecting';
  const lastMsg = engine.messages[engine.messages.length - 1];
  const showSkeleton = isConnecting && lastMsg?.role === 'assistant' && !lastMsg.content;

  const showSuggestions =
    !engine.isStreaming &&
    lastMsg?.role === 'assistant' &&
    !lastMsg.isStreaming &&
    !lastMsg.pendingAction &&
    lastMsg.content.length > 0;

  const suggestedActions = showSuggestions
    ? deriveSuggestedActions(lastMsg?.tools)
    : [];

  return (
    <div className="space-y-3">
      {isEmpty && !engine.isStreaming && (
        <div className="flex flex-col items-center py-8 space-y-4">
          <p className="text-sm text-muted">{greeting}</p>
          <QuickActions onSelect={handleQuickAction} disabled={engine.isStreaming} />
        </div>
      )}

      {!isEmpty && engine.messages[0]?.role === 'user' && (
        <ChatDivider label="TASK INITIATED" />
      )}

      {engine.messages.map((msg) => {
        if (showSkeleton && msg.id === lastMsg?.id) {
          return <ConnectingSkeleton key={msg.id} />;
        }
        return (
          <ChatMessage
            key={msg.id}
            message={msg}
            onActionResolve={handleActionResolve}
          />
        );
      })}

      {suggestedActions.length > 0 && (
        <div className="pl-1">
          <SuggestedActions
            actions={suggestedActions}
            onSelect={handleSuggestedAction}
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

      <div ref={feedEndRef} />
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
