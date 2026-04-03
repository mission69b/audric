'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  EngineChatMessage,
  ToolExecution,
  PendingAction,
  UsageData,
  EngineStatus,
  SSEEvent,
} from '@/lib/engine-types';

let msgIdCounter = 0;
function nextMsgId(): string {
  return `emsg_${Date.now()}_${++msgIdCounter}`;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface UseEngineOptions {
  address: string | null;
  jwt: string | undefined;
}

export function useEngine({ address, jwt }: UseEngineOptions) {
  const [messages, setMessages] = useState<EngineChatMessage[]>([]);
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgRef = useRef<string | null>(null);
  const lastFailedMessage = useRef<string | null>(null);
  const hasReceivedContent = useRef(false);
  const retryCountRef = useRef(0);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!address || !jwt) return;
      if (status === 'streaming' || status === 'connecting' || status === 'executing') return;

      setError(null);
      lastFailedMessage.current = null;
      retryCountRef.current = 0;
      hasReceivedContent.current = false;

      const userMsg: EngineChatMessage = {
        id: nextMsgId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      const assistantMsg: EngineChatMessage = {
        id: nextMsgId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        tools: [],
        isStreaming: true,
      };

      streamingMsgRef.current = assistantMsg.id;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      await attemptStream('/api/engine/chat', {
        message: text,
        address,
        sessionId: sessionId ?? undefined,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, jwt, sessionId, status],
  );

  /**
   * Resume the engine after a pending action is resolved.
   * Opens a new SSE stream to /api/engine/resume with the tool result.
   */
  const resolveAction = useCallback(
    async (action: PendingAction, approved: boolean, executionResult?: unknown, denyReason?: 'timeout' | 'denied') => {
      if (!sessionId || !jwt || !address) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (!m.pendingAction || m.pendingAction.toolUseId !== action.toolUseId) return m;
          return { ...m, pendingAction: undefined };
        }),
      );

      if (!approved) {
        const content = denyReason === 'timeout'
          ? 'Action timed out (60s). Ask me to try again.'
          : 'Action denied.';
        const denialMsg: EngineChatMessage = {
          id: nextMsgId(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, denialMsg]);
        return;
      }

      const resumeMsg: EngineChatMessage = {
        id: nextMsgId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        tools: [],
        isStreaming: true,
      };

      streamingMsgRef.current = resumeMsg.id;
      setMessages((prev) => [...prev, resumeMsg]);

      await attemptStream('/api/engine/resume', {
        address,
        sessionId,
        action,
        approved,
        executionResult,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, jwt, sessionId],
  );

  async function attemptStream(url: string, body: Record<string, unknown>) {
    setStatus('connecting');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt!,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Request failed' }));
        const errMsg = errBody.error || `HTTP ${res.status}`;

        if (res.status === 401) {
          throw new AuthError(errMsg);
        }
        throw new Error(errMsg);
      }

      setStatus('streaming');
      retryCountRef.current = 0;

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          processSSEChunk(chunk);
        }
      }

      if (buffer.trim()) {
        processSSEChunk(buffer);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMsgRef.current
            ? { ...m, isStreaming: false }
            : m,
        ),
      );
      streamingMsgRef.current = null;
      abortRef.current = null;
      setStatus('idle');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgRef.current
              ? { ...m, isStreaming: false, content: m.content || 'Cancelled.' }
              : m,
          ),
        );
        streamingMsgRef.current = null;
        abortRef.current = null;
        setStatus('idle');
        return;
      }

      if (err instanceof AuthError) {
        setError('Session expired — please sign in again');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgRef.current
              ? { ...m, isStreaming: false, content: 'Authentication expired.' }
              : m,
          ),
        );
        streamingMsgRef.current = null;
        abortRef.current = null;
        setStatus('error');
        return;
      }

      if (!hasReceivedContent.current && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        const delay = BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
        await new Promise((r) => setTimeout(r, delay));
        if (abortRef.current?.signal.aborted) return;
        await attemptStream(url, body);
        return;
      }

      const errorMsg = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMsg);
      if (body.message) lastFailedMessage.current = body.message as string;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMsgRef.current
            ? { ...m, isStreaming: false, content: m.content || errorMsg }
            : m,
        ),
      );
      streamingMsgRef.current = null;
      abortRef.current = null;
      setStatus('idle');
    }
  }

  function processSSEChunk(raw: string) {
    const lines = raw.split('\n');
    let eventType = '';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6);
      }
    }

    if (!dataStr) return;

    if (eventType === 'session') {
      try {
        const parsed = JSON.parse(dataStr) as { sessionId: string };
        setSessionId(parsed.sessionId);
      } catch { /* ignore */ }
      return;
    }

    let event: SSEEvent;
    try {
      event = JSON.parse(dataStr) as SSEEvent;
    } catch {
      return;
    }

    const msgId = streamingMsgRef.current;
    if (!msgId) return;

    switch (event.type) {
      case 'text_delta':
        hasReceivedContent.current = true;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, content: m.content + event.text }
              : m,
          ),
        );
        break;

      case 'tool_start': {
        const tool: ToolExecution = {
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          input: event.input,
          status: 'running',
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, tools: [...(m.tools ?? []), tool] }
              : m,
          ),
        );
        break;
      }

      case 'tool_result':
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            const tools = (m.tools ?? []).map((t) =>
              t.toolUseId === event.toolUseId
                ? { ...t, status: event.isError ? 'error' as const : 'done' as const, result: event.result, isError: event.isError }
                : t,
            );
            return { ...m, tools };
          }),
        );
        break;

      case 'pending_action': {
        hasReceivedContent.current = true;
        setStatus('executing');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, pendingAction: event.action, isStreaming: false }
              : m,
          ),
        );
        break;
      }

      case 'usage':
        setUsage({
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  usage: {
                    inputTokens: event.inputTokens,
                    outputTokens: event.outputTokens,
                    cacheReadTokens: event.cacheReadTokens,
                    cacheWriteTokens: event.cacheWriteTokens,
                  },
                }
              : m,
          ),
        );
        break;

      case 'error':
        setError(event.message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, content: m.content || event.message, isStreaming: false }
              : m,
          ),
        );
        break;

      case 'turn_complete':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, isStreaming: false } : m,
          ),
        );
        break;
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const msg = lastFailedMessage.current;
    if (!msg) return;

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && !last.content) {
        return prev.slice(0, -2);
      }
      if (last?.role === 'assistant') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    lastFailedMessage.current = null;
    setError(null);

    setTimeout(() => sendMessage(msg), 0);
  }, [sendMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setUsage(null);
    setError(null);
    lastFailedMessage.current = null;
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      setMessages([]);
      setSessionId(id);
      setUsage(null);
      setError(null);
      lastFailedMessage.current = null;

      if (!jwt) return;
      try {
        const res = await fetch(`/api/engine/sessions/${encodeURIComponent(id)}`, {
          headers: { 'x-zklogin-jwt': jwt },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages?.length) {
          setMessages(data.messages as EngineChatMessage[]);
        }
      } catch {
        // session loads silently
      }
    },
    [jwt],
  );

  const injectMessage = useCallback((msg: EngineChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  return {
    messages,
    status,
    sessionId,
    usage,
    error,
    sendMessage,
    resolveAction,
    cancel,
    retry,
    clearMessages,
    loadSession,
    injectMessage,
    canRetry: !!lastFailedMessage.current,
    isStreaming: status === 'streaming' || status === 'connecting' || status === 'executing',
  };
}
