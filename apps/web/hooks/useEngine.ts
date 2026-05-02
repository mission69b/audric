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
import {
  applyEventToTimeline,
  markPermissionCardResolved,
  markTimelineInterrupted,
  mergeWriteExecutionIntoTimeline,
} from '@/lib/timeline-builder';
import { asHarnessVersion, type HarnessVersion } from '@/lib/interactive-harness';

// [v1.4] Re-export the pure executor so consumers and tests can use a single
// import path: `import { executeToolAction } from '@/hooks/useEngine'`.
//
// [SPEC 7 P2.4 Layer 3] Bundle executor re-export. Hosts dispatching
// multi-write Payment Streams import this alongside `executeToolAction`.
export {
  executeToolAction,
  executeBundleAction,
  type ExecuteToolActionResult,
  type ExecuteToolActionEffects,
  type ExecuteBundleResult,
  type BundleStepResult,
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
  // [SPEC 8 v0.5.1 B3.3 / G4] Per-session harness version pinned by the
  // server. `null` while the session SSE event hasn't arrived yet (or
  // for unauth/demo paths that have no persisted session). The
  // `<ChatMessage>` consumer falls back to the global env-var when
  // this is `null`.
  const [harnessVersion, setHarnessVersion] = useState<HarnessVersion | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgRef = useRef<string | null>(null);
  const lastFailedMessage = useRef<string | null>(null);
  const hasReceivedContent = useRef(false);
  const retryCountRef = useRef(0);
  // [B3.4 / Gap J] Tracked per-stream so the cleanup paths (AbortError,
  // post-retry failure, EOF without `turn_complete`) can flag the
  // streaming message as interrupted. Reset at the top of `sendMessage`
  // and flipped on inside `processSSEChunk` when `turn_complete` lands.
  const turnCompleteSeenRef = useRef(false);
  // [B3.4 / Gap J] Set when the engine yielded `pending_action` —
  // these turns end the stream cleanly WITHOUT `turn_complete`, so we
  // must not flag them as interrupted (the pause is intentional).
  const pendingActionSeenRef = useRef(false);
  // [B3.4 / Gap J] The user message text whose reply is currently
  // streaming. Captured at `sendMessage` time so the retry button can
  // replay it even if the user types more in between.
  const currentReplayTextRef = useRef<string | null>(null);

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
      turnCompleteSeenRef.current = false;
      pendingActionSeenRef.current = false;
      currentReplayTextRef.current = text;

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
      /**
       * [SPEC 7 P2.4 Layer 3] Per-step results for a multi-write bundle.
       * When set, `executionResult` is undefined and the resume route
       * passes the array verbatim to `engine.resumeWithToolResult` so
       * the engine emits N tool_result blocks (one per step) back to
       * the LLM. Mutually exclusive with `executionResult` — the bundle
       * branch in `handleActionResolve` populates one or the other.
       */
      stepResults?: Array<{
        toolUseId: string;
        attemptId: string;
        result: unknown;
        isError: boolean;
      }>,
    ) => {
      if (!sessionId || !jwt || !address) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (!m.pendingAction || m.pendingAction.toolUseId !== action.toolUseId) return m;
          // [SPEC 7 P2.4] For bundles, walk every step's toolUseId to
          // mark each as done with its per-step result. For single-write,
          // the legacy single-tool branch covers it.
          const isBundle = stepResults && stepResults.length > 0;
          const resultByToolUseId = new Map<string, { result: unknown; isError: boolean }>();
          if (isBundle && stepResults) {
            for (const sr of stepResults) {
              resultByToolUseId.set(sr.toolUseId, { result: sr.result, isError: sr.isError });
            }
          }
          const tools = approved && (executionResult !== undefined || isBundle)
            ? (m.tools ?? []).map((t) => {
                if (isBundle && resultByToolUseId.has(t.toolUseId)) {
                  const sr = resultByToolUseId.get(t.toolUseId)!;
                  return { ...t, status: 'done' as const, result: sr.result, isError: sr.isError };
                }
                if (t.toolUseId === action.toolUseId && executionResult !== undefined) {
                  return { ...t, status: 'done' as const, result: executionResult, isError: false };
                }
                return t;
              })
            : m.tools;
          // [SPEC 8 v0.5.1 B3.1 / audit Gap B] Transition the matching
          // permission-card timeline block out of 'pending' so the new
          // ReasoningTimeline path stops rendering an active approve/deny
          // card after resolution. The legacy `pendingAction = undefined`
          // above takes care of the same thing for the legacy renderer; this
          // line covers the timeline path. Skip entirely when the message
          // never carried a timeline (flag-OFF sessions) so we don't
          // synthesize an empty array on legacy messages.
          let timeline = m.timeline
            ? markPermissionCardResolved(m.timeline, action.toolUseId, approved ? 'approved' : 'denied')
            : m.timeline;
          // [SPEC 8 v0.5.2 hotfix · Bug B] Synthesize a 'done' tool block
          // carrying the executionResult so v2 can render
          // <TransactionReceiptCard> (which keys off `result.data.tx`).
          // The engine never emits a tool_result event after resume —
          // it only injects the result into the LLM message history —
          // so without this merge the timeline path would silently
          // drop the SuiScan link the legacy `tools[]` path renders.
          if (timeline && approved && isBundle && action.steps) {
            // [SPEC 7 P2.4] Bundle path — merge each step's per-step
            // result into the timeline so each tool block in the
            // chronological view renders its own outcome (matches the
            // legacy `tools[]` mutation above).
            const now = Date.now();
            for (const step of action.steps) {
              const sr = resultByToolUseId.get(step.toolUseId);
              if (!sr) continue;
              timeline = mergeWriteExecutionIntoTimeline(
                timeline,
                step.toolUseId,
                step.toolName,
                step.input,
                sr.result,
                now,
              );
            }
          } else if (timeline && approved && executionResult !== undefined) {
            timeline = mergeWriteExecutionIntoTimeline(
              timeline,
              action.toolUseId,
              action.toolName,
              action.input,
              executionResult,
              Date.now(),
            );
          }
          return { ...m, pendingAction: undefined, tools, timeline };
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

      // [SPEC 8 v0.5.1 audit polish] Reset stream-cleanliness refs before
      // opening the resume stream. Without this reset, `pendingActionSeenRef`
      // remains `true` from the chat turn that yielded the original
      // pending_action, so a resume stream that gets cut off mid-narration
      // would NOT flag the new resume message as interrupted (the cleanup
      // paths in `attemptStream` skip the flag when `pendingActionSeenRef`
      // is set, on the assumption the engine paused intentionally — which
      // is true for chat → pending_action, but false for resume → drop).
      // `currentReplayTextRef` keeps the original user message so the
      // retry button still fires a fresh chat turn (action was already
      // executed; no duplicate exec risk).
      turnCompleteSeenRef.current = false;
      pendingActionSeenRef.current = false;
      hasReceivedContent.current = false;

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
        // [SPEC 7 P2.4] Bundle resume — append per-step results when the
        // caller approved a multi-write Payment Stream. Engine matches
        // each step's `toolUseId` to its result and emits N `tool_result`
        // blocks back to the LLM (atomic semantics).
        ...(stepResults && stepResults.length > 0 ? { stepResults } : {}),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, jwt, sessionId],
  );

  /**
   * [B3.4 / Gap J] Patch the streaming assistant message so the UI can
   * render `<RetryInterruptedTurn>`. Walks any in-flight timeline
   * blocks (text/thinking still `streaming`, tools still `running`)
   * and flips them to `interrupted`, then sets `interrupted: true` and
   * captures the user's last input as `interruptedReplayText`.
   *
   * Idempotent (safe to call from multiple cleanup paths) and a no-op
   * for messages that completed normally.
   */
  function flagInterrupted(msgId: string | null) {
    if (!msgId) return;
    const replayText = currentReplayTextRef.current;
    if (!replayText) return;
    const now = Date.now();
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        // The legacy path (no timeline) gets only the message-level
        // flag — the renderer falls through to the legacy retry surface.
        const nextTimeline = markTimelineInterrupted(m.timeline, now);
        return {
          ...m,
          isStreaming: false,
          interrupted: true,
          interruptedReplayText: replayText,
          // Reference-equal when no in-flight blocks were found, so React
          // skips the timeline re-render in the (rare) clean-disconnect case.
          timeline: nextTimeline,
        };
      }),
    );
  }

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

      // [B3.4 / Gap J] If the stream closed cleanly without a
      // `turn_complete` AND no `pending_action` was emitted (the
      // intentional pause case), the engine itself was cut off
      // (server crash / serverless timeout / network blip). Flag the
      // message so the user can retry.
      if (!turnCompleteSeenRef.current && !pendingActionSeenRef.current) {
        flagInterrupted(streamingMsgRef.current);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgRef.current
              ? { ...m, isStreaming: false }
              : m,
          ),
        );
      }
      streamingMsgRef.current = null;
      abortRef.current = null;
      setStatus('idle');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // [B3.4 / Gap J] User aborts (Stop button / page nav) ARE
        // interruptions — the UI should offer a retry, same as a
        // network drop. The message keeps its partial content; the
        // retry button gets the original user text. We DON'T flag
        // when `pending_action` was already emitted (the engine
        // already paused; the stream-cleanup path here is the same as
        // a clean close).
        if (!pendingActionSeenRef.current) {
          flagInterrupted(streamingMsgRef.current);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgRef.current
                ? { ...m, isStreaming: false, content: m.content || 'Cancelled.' }
                : m,
            ),
          );
        }
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
      // [B3.4 / Gap J] After exhausting retries (or hitting a non-
      // retriable error) we end up here. If the stream had started
      // emitting events before failing AND the engine wasn't already
      // paused at `pending_action`, the partial timeline survives —
      // flag it as interrupted so the retry button shows up. For the
      // pre-stream HTTP-error case there's no timeline to flag, so the
      // legacy `errorMsg` path takes over.
      if (hasReceivedContent.current && !pendingActionSeenRef.current) {
        flagInterrupted(streamingMsgRef.current);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgRef.current
              ? { ...m, isStreaming: false, content: m.content || errorMsg }
              : m,
          ),
        );
      }
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
        // [B3.3 / G4] Server now also stamps `harnessVersion` here so the
        // client can pin <ChatMessage> rendering for the life of this
        // session. Older deploys may omit the field — `asHarnessVersion`
        // returns `undefined` in that case and we leave the existing
        // pin untouched (still better than re-reading the env var).
        const parsed = JSON.parse(dataStr) as {
          sessionId: string;
          harnessVersion?: unknown;
        };
        setSessionId(parsed.sessionId);
        const v = asHarnessVersion(parsed.harnessVersion);
        if (v) setHarnessVersion(v);
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
        // [B3.4 / Gap J] Stream will end cleanly without
        // `turn_complete`; that's the engine's pause-for-confirm
        // signal, not an interruption. The flagInterrupted cleanup
        // paths skip the message when this ref is set.
        pendingActionSeenRef.current = true;
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
        // [B3.4 / Gap J] Mark the turn as cleanly completed BEFORE the
        // stream-end path runs. The cleanup paths in `attemptStream`
        // check this ref to decide whether to flag the message as
        // `interrupted`. `applyEventToTimeline` also flips any still-
        // streaming blocks to `done` here, so the timeline is left in
        // a clean state.
        turnCompleteSeenRef.current = true;
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

      // [SPEC 8 v0.5.1 B3.2] One-shot per-turn harness shape declaration.
      // Stamp on the assistant message so `TurnMetrics.harnessShape`
      // (and future engineering-only effort badges) can read it. NOT a
      // timeline block — `applyEventToTimeline` returns the timeline
      // unchanged for this event type. Idempotent: a repeat emission
      // (shouldn't happen — engine emits exactly once per submitMessage)
      // would just overwrite with the same value.
      case 'harness_shape': {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  harnessShape: event.shape,
                  harnessRationale: event.rationale,
                }
              : m,
          ),
        );
        break;
      }
    }

    // [SPEC 8 v0.5.1 B2.1] Dual-write to the chronological timeline.
    // Every event runs through applyEventToTimeline. React batches this
    // setMessages call with the per-case one above into a single render.
    // When the event has no timeline impact (usage, error) the helper
    // returns the same reference and we short-circuit to skip the
    // re-render. now is hoisted outside the reducer so StrictMode's
    // double-invoke doesn't drift timestamps.
    const now = Date.now();
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const next = applyEventToTimeline(m.timeline, event, now);
        return next === m.timeline ? m : { ...m, timeline: next };
      }),
    );
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
    // [B3.3 / G4] Drop the pinned harness version on "new chat" so the
    // next session's first turn evaluates the env-var fresh.
    setHarnessVersion(null);
    lastFailedMessage.current = null;
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      setMessages([]);
      setSessionId(id);
      setUsage(null);
      setError(null);
      // [B3.3 / G4] Reset before fetch — old session's pin must not leak
      // into the new one's first render.
      setHarnessVersion(null);
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
        // [B3.3 / G4] Pre-B3.3 sessions return `undefined`; leave the
        // pin null so the renderer falls back to the env-var. The next
        // chat turn on this session will pin it (and the GET will then
        // return it on subsequent loads).
        const v = asHarnessVersion(data.harnessVersion);
        if (v) setHarnessVersion(v);
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
    // [B3.3 / G4] Per-session pinned harness version (`'v2'` | `'legacy'`)
    // OR `null` until the server announces it. Consumers (`<ChatMessage>`
    // via `<UnifiedTimeline>`) prefer this over the raw env-var read.
    harnessVersion,
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
