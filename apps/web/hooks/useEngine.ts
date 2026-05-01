'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  EngineChatMessage,
  ToolExecution,
  PendingAction,
  UsageData,
  EngineStatus,
  SSEEvent,
  CanvasData,
} from '@/lib/engine-types';

// [v1.4] Re-export the pure executor so consumers and tests can use a single
// import path: `import { executeToolAction } from '@/hooks/useEngine'`.
export {
  executeToolAction,
  type ExecuteToolActionResult,
  type ExecuteToolActionEffects,
} from './executeToolAction';

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
  /**
   * Fired whenever a tool resolves (success or error). Used by the
   * dashboard to refresh server-owned client caches after writes the
   * tool itself persisted (e.g. `save_contact` writes via Prisma in
   * `lib/engine/contact-tools.ts`; the contacts tab needs to re-read).
   */
  onToolResult?: (event: {
    toolName: string;
    toolUseId: string;
    isError: boolean;
    result: unknown;
  }) => void;
}

function buildHistory(messages: EngineChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages
    .filter((m) => m.content)
    .map((m) => ({ role: m.role, content: m.content }));
}

export function useEngine({ address, jwt, onToolResult }: UseEngineOptions) {
  // Hold the latest callback in a ref so the SSE handler doesn't re-bind
  // (and risk dropping events) when the parent re-renders with a new fn.
  const onToolResultRef = useRef(onToolResult);
  onToolResultRef.current = onToolResult;
  const isAuth = !!address && !!jwt;
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

  const messagesRef = useRef<EngineChatMessage[]>([]);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (text: string) => {
      if (isAuth && (!address || !jwt)) return;
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

      if (isAuth) {
        await attemptStream('/api/engine/chat', {
          message: text,
          address,
          sessionId: sessionId ?? undefined,
        });
      } else {
        const history = buildHistory([...messagesRef.current, userMsg]);
        await attemptStream('/api/engine/chat', { message: text, history });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, jwt, sessionId, status, isAuth],
  );

  /**
   * Resume the engine after a pending action is resolved.
   * Opens a new SSE stream to /api/engine/resume with the tool result.
   */
  /**
   * [v1.4 Item 6] `modifications` carries user-edited input fields from
   * `PermissionCard`. The resume route overlays them on `action.input`
   * before persisting the originating turn so analytics see the modified
   * values, and stamps `pendingActionOutcome='modified'` when set.
   */
  const resolveAction = useCallback(
    async (
      action: PendingAction,
      approved: boolean,
      executionResult?: unknown,
      denyReason?: 'timeout' | 'denied',
      modifications?: Record<string, unknown>,
      /**
       * [v1.4.2 — Day 4 / Spec m1] Wall-clock ms the caller spent
       * executing the approved write tool — typically the
       * `onExecuteAction` round-trip in `UnifiedTimeline.handleActionResolve`.
       * Forwarded to `/api/engine/resume` so the matching `TurnMetrics`
       * row's `writeToolDurationMs` column is populated. Optional
       * because deny / timeout / pre-validation-fail paths skip the
       * execution step entirely; the resume route accepts `undefined`
       * and writes `null` (column is nullable per Day-3 schema).
       */
      executionDurationMs?: number,
    ) => {
      if (!sessionId || !jwt || !address) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (!m.pendingAction || m.pendingAction.toolUseId !== action.toolUseId) return m;
          const tools = approved && executionResult !== undefined
            ? (m.tools ?? []).map((t) =>
                t.toolUseId === action.toolUseId
                  ? { ...t, status: 'done' as const, result: executionResult, isError: false }
                  : t,
              )
            : m.tools;
          return { ...m, pendingAction: undefined, tools };
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
        ...(modifications && Object.keys(modifications).length
          ? { modifications, outcome: 'modified' as const }
          : {}),
        // [v1.4.2 — Day 4 / Spec m1] Append optionally — only forward
        // when the caller actually measured an execution. Keeps the
        // body shape stable for deny / timeout paths that skip
        // `onExecuteAction` entirely.
        ...(typeof executionDurationMs === 'number' && executionDurationMs >= 0
          ? { executionDurationMs }
          : {}),
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (jwt) headers['x-zklogin-jwt'] = jwt;

      const res = await fetch(url, {
        method: 'POST',
        headers,
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
      case 'thinking_delta':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, thinking: (m.thinking ?? '') + event.text, isThinking: true }
              : m,
          ),
        );
        break;

      case 'thinking_done':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, isThinking: false } : m,
          ),
        );
        break;

      case 'text_delta':
        hasReceivedContent.current = true;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, content: m.content + event.text, isThinking: false }
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
        // Notify hosts about every resolved tool so they can refresh
        // server-owned client caches (e.g. `save_contact` persists
        // via Prisma; the contacts tab needs to re-read after that).
        // Fired even for deduped results — the tool DID succeed, the
        // dedup just suppresses the duplicate UI card.
        try {
          onToolResultRef.current?.({
            toolName: event.toolName,
            toolUseId: event.toolUseId,
            isError: !!event.isError,
            result: event.result,
          });
        } catch {
          // Host callback errors must not break stream processing.
        }

        // [v0.46.8] When the engine flags `resultDeduped: true`, this
        // tool_use_id is the SECOND (or Nth) call to the same read-only
        // tool with identical args within one user turn. The first call
        // already rendered a card; rendering this one would stack a
        // duplicate on top. The engine still emits the event so the
        // LLM's tool_use_id has a matching tool_result in history, but
        // the host MUST suppress the UI entry. Two paths to handle:
        //   1. EarlyToolDispatcher dedup → a `tool_start` already
        //      created a "running" tool entry; we REMOVE it here so
        //      the card never renders.
        //   2. Post-LLM cache-hit dedup → no `tool_start` was emitted,
        //      no entry exists; the removal below is a no-op.
        if (event.resultDeduped) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId) return m;
              const tools = (m.tools ?? []).filter((t) => t.toolUseId !== event.toolUseId);
              return { ...m, tools };
            }),
          );
          break;
        }

        setMessages((prev) => {
          const alreadyResolved = prev.some((m) =>
            m.id !== msgId && (m.tools ?? []).some((t) => t.toolUseId === event.toolUseId && t.status === 'done'),
          );
          if (alreadyResolved) return prev;

          return prev.map((m) => {
            if (m.id !== msgId) return m;
            const existing = (m.tools ?? []);
            const found = existing.some((t) => t.toolUseId === event.toolUseId);
            if (found) {
              const tools = existing.map((t) =>
                t.toolUseId === event.toolUseId
                  ? { ...t, status: event.isError ? 'error' as const : 'done' as const, result: event.result, isError: event.isError }
                  : t,
              );
              return { ...m, tools };
            }
            return {
              ...m,
              tools: [...existing, {
                toolName: event.toolName,
                toolUseId: event.toolUseId,
                input: {},
                status: event.isError ? 'error' as const : 'done' as const,
                result: event.result,
                isError: event.isError,
              }],
            };
          });
        });
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

      case 'canvas': {
        const canvas: CanvasData = {
          template: event.template,
          title: event.title,
          data: event.data,
          toolUseId: event.toolUseId,
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, canvases: [...(m.canvases ?? []), canvas] }
              : m,
          ),
        );
        break;
      }

      // [SPEC 8 v0.5.1 B1] Captured-but-not-rendered.
      // Three new SSE event types ship with @t2000/engine@1.4.0. We
      // stash them on the message so B2's ReasoningTimeline can read
      // them later — today nothing renders. Keeping the cases explicit
      // (vs. a no-op default) means TypeScript exhaustiveness still
      // protects us when SPEC 9 adds more events.
      case 'todo_update': {
        const update = { items: event.items, toolUseId: event.toolUseId };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, todoUpdates: [...(m.todoUpdates ?? []), update] }
              : m,
          ),
        );
        break;
      }

      case 'tool_progress': {
        const progress = {
          toolUseId: event.toolUseId,
          toolName: event.toolName,
          message: event.message,
          pct: event.pct,
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, toolProgress: [...(m.toolProgress ?? []), progress] }
              : m,
          ),
        );
        break;
      }

      case 'pending_input': {
        const input = {
          schema: event.schema,
          inputId: event.inputId,
          prompt: event.prompt,
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, pendingInputs: [...(m.pendingInputs ?? []), input] }
              : m,
          ),
        );
        break;
      }
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
