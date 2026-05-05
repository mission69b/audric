'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  EngineChatMessage,
  ToolExecution,
  PendingAction,
  UsageData,
  EngineStatus,
  SSEEvent,
  AudricSSEEvent,
  CanvasData,
  RegeneratedTimelineBlock,
  ToolTimelineBlock,
  TimelineBlock,
} from '@/lib/engine-types';
import {
  applyEventToTimeline,
  markPermissionCardResolved,
  markPendingInputStatus,
  markTimelineInterrupted,
  mergeWriteExecutionIntoTimeline,
  mergeBundleExecutionIntoTimeline,
} from '@/lib/timeline-builder';
import { asHarnessVersion, type HarnessVersion } from '@/lib/interactive-harness';
import type { RegenerateTimelineEvent, RegenerateFailure } from '@t2000/engine';
import { REGEN_ERROR_COPY } from '@/lib/engine/regen-error-copy';

// [v1.4] Re-export the pure executor so consumers and tests can use a single
// import path: `import { executeToolAction } from '@/hooks/useEngine'`.
//
// [SPEC 7 P2.4 Layer 3] Bundle executor re-export. Hosts dispatching
// multi-write Payment Intents import this alongside `executeToolAction`.
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
  /**
   * [SPEC 7 P2.5b Layer 5] Contacts list passed through to the
   * timeline reducer (`applyEventToTimeline`). When set, the reducer
   * scans `tool_start` and `pending_action` event inputs for
   * recipient-style fields (`to` / `recipient` / `address`) whose
   * value matches a known contact name, and injects a synthetic
   * `contact-resolved` row before the tool / card block. Omitting
   * (or passing an empty array) keeps pre-P2.5b behavior — no
   * synthetic rows surface.
   *
   * Held in a ref so the SSE handler doesn't rebind on every parent
   * re-render of the contacts hook (which fires on add/edit/delete).
   */
  contacts?: ReadonlyArray<{ name: string; address: string }>;
}

function buildHistory(messages: EngineChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages
    .filter((m) => m.content)
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * [SPEC 7 P2.4b] Rebuild a message's timeline after a successful
 * regenerate. Three things need to happen, in order:
 *  1. Find the `permission-card` block whose `payload.attemptId`
 *     matches the old action and swap its `payload` to the fresh
 *     `newAction` (so the renderer sees the new attemptId + quoteAge).
 *  2. Insert the `regeneratedBlock` immediately ABOVE that card, so
 *     the user reads "↻ Regenerated · 1.4s" then the fresh card.
 *  3. Leave every other block untouched — we do not unwind the prior
 *     `tool` blocks for the old reads (they're conversational history
 *     and should remain visible).
 *
 * Returns the same reference when no permission-card matches (e.g. a
 * legacy session with no timeline writes), so React skips the
 * timeline re-render in those cases.
 */
function updateTimelineForRegenerate(
  timeline: TimelineBlock[] | undefined,
  oldAttemptId: string,
  newAction: PendingAction,
  regeneratedBlock: RegeneratedTimelineBlock,
): TimelineBlock[] | undefined {
  if (!timeline || timeline.length === 0) return timeline;
  const cardIdx = timeline.findIndex(
    (b) =>
      b.type === 'permission-card' &&
      b.payload.attemptId === oldAttemptId,
  );
  if (cardIdx < 0) return timeline;
  const next: TimelineBlock[] = [];
  for (let i = 0; i < timeline.length; i++) {
    if (i === cardIdx) {
      next.push(regeneratedBlock);
      next.push({
        type: 'permission-card',
        payload: newAction,
        status: 'pending',
      });
      continue;
    }
    next.push(timeline[i]);
  }
  return next;
}

export function useEngine({ address, jwt, onToolResult, contacts }: UseEngineOptions) {
  // Hold the latest callback in a ref so the SSE handler doesn't re-bind
  // (and risk dropping events) when the parent re-renders with a new fn.
  const onToolResultRef = useRef(onToolResult);
  onToolResultRef.current = onToolResult;
  // [SPEC 7 P2.5b] Held in a ref so contact additions/edits during a
  // streaming turn don't re-bind the SSE handler. The reducer reads
  // the latest list at event-emit time — late-add of a contact whose
  // name appears in a still-streaming tool_start would correctly
  // surface the synthetic row.
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
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

  // [SPEC 7 P2.4b] Set of `attemptId`s currently mid-flight on the
  // regenerate endpoint. Renders as the spinner-state Regenerate button
  // on the matching PermissionCard. Maintained as state (not ref) so
  // the cards re-render when an attempt enters/leaves the set.
  const [regeneratingAttemptIds, setRegeneratingAttemptIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

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
   * [SPEC 15 Phase 2] Send a chip click as a chat turn. Mirrors
   * `sendMessage` but adds the `chipDecision` body field that the
   * chat route's chip-routing block reads to short-circuit the LLM.
   *
   * **Wire-format contract** (per `SPEC_15_PHASE2_DESIGN.md` v0.2):
   *   - value='yes' → message text MUST be a CONFIRM_PATTERN match
   *     ("Confirm") so a stale-stash mismatch can fall through to
   *     the regex-admitted text-confirm path.
   *   - value='no' → message text SHOULD be verb-aligned ("Cancel")
   *     for chat-history readability. The chat route appends the
   *     message to the engine ledger as the user turn before
   *     synthesizing the assistant cancel acknowledgment.
   *
   * Auth-gated — chip clicks against an unauth/demo session are
   * silently ignored (the chat route would reject them anyway because
   * `saveSession=false` skips the chip-routing block).
   */
  const sendChipDecision = useCallback(
    async (decision: { value: 'yes' | 'no'; forStashId: string }) => {
      if (!isAuth || !address || !jwt) return;
      if (!sessionId) return;
      if (status === 'streaming' || status === 'connecting' || status === 'executing') return;
      if (!decision.forStashId) return;

      setError(null);
      lastFailedMessage.current = null;
      retryCountRef.current = 0;
      hasReceivedContent.current = false;
      turnCompleteSeenRef.current = false;
      pendingActionSeenRef.current = false;

      const messageText = decision.value === 'yes' ? 'Confirm' : 'Cancel';
      currentReplayTextRef.current = messageText;

      const userMsg: EngineChatMessage = {
        id: nextMsgId(),
        role: 'user',
        content: messageText,
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
        message: messageText,
        address,
        sessionId: sessionId ?? undefined,
        chipDecision: {
          via: 'chip',
          value: decision.value,
          forStashId: decision.forStashId,
        },
      });
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
          if (timeline && approved && isBundle && action.steps && action.steps.length >= 2) {
            // [SPEC 7 P2.7 prep / Finding F6] Bundle path — fold all
            // legs into ONE `bundle-receipt` block instead of N
            // separate `tool` blocks. Pre-fix this loop synthesized
            // N tool blocks via `mergeWriteExecutionIntoTimeline`,
            // each rendering as its own `TransactionReceiptCard` with
            // a duplicate "View on Suiscan" link. Atomic Payment Intent ⇒ one
            // digest ⇒ one receipt is the correct mental model.
            // Single-step "bundles" (rare; `length === 1`) fall
            // through to the single-write branch below for parity.
            timeline = mergeBundleExecutionIntoTimeline(
              timeline,
              action,
              stepResults ?? [],
              Date.now(),
            );
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
        // caller approved a multi-write Payment Intent. Engine matches
        // each step's `toolUseId` to its result and emits N `tool_result`
        // blocks back to the LLM (atomic semantics).
        ...(stepResults && stepResults.length > 0 ? { stepResults } : {}),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, jwt, sessionId],
  );

  /**
   * [SPEC 7 P2.4b] Quote-Refresh handler — POSTs the bundle's
   * `attemptId` to `/api/engine/regenerate`, rebuilds the matching
   * timeline (insert "↻ Regenerated · Ns" group above the card,
   * swap the card's `payload` to the fresh action), and surfaces
   * failures via `setError`. Idempotent on the in-flight set so
   * double-tapping the button is a no-op while the round-trip is
   * still pending.
   */
  // ─────────────────────────────────────────────────────────────────────
  // [SPEC 9 v0.1.3 P9.4] handlePendingInputSubmit
  //
  // Wired into `<BlockRouter>` via the `onPendingInputSubmit` prop
  // chain (UnifiedTimeline → ChatMessage → ReasoningTimeline → BlockRouter
  // → PendingInputBlockView). When the user submits the inline form,
  // this:
  //
  //   1. Locates the `pending-input` block by `inputId` (across all
  //      timeline messages — the block lives on the assistant message
  //      that yielded the pause).
  //   2. Flips block.status → 'submitting' (form disables + spinner).
  //   3. POSTs the FULL `PendingInput` payload + values to
  //      `/api/engine/resume-with-input`.
  //   4a. On 200: flips to 'submitted' + captures `submittedValues`.
  //       SSE round-trip into the same assistant message ships in P9.6
  //       (mirrors `handleRegenerate`'s timeline-merge pattern).
  //   4b. On non-200: flips to 'error' with the server's errorMessage
  //       so the form re-shows for re-submit.
  //
  // The block carries `assistantContent` + `completedResults` from the
  // wire event so we can echo back the full payload — no server-side
  // session storage needed for the pause state.
  // ─────────────────────────────────────────────────────────────────────
  const handlePendingInputSubmit = useCallback(
    async (inputId: string, values: Record<string, unknown>) => {
      if (!sessionId || !jwt || !address) return;

      // Locate the pending-input block across all messages. There can
      // be multiple paused inputs in theory; we match by stable inputId.
      let foundBlock: import('@/lib/engine-types').PendingInputTimelineBlock | null = null;
      let foundMsgId: string | null = null;
      for (const m of messagesRef.current) {
        const b = m.timeline?.find(
          (b): b is import('@/lib/engine-types').PendingInputTimelineBlock =>
            b.type === 'pending-input' && b.inputId === inputId,
        );
        if (b) {
          foundBlock = b;
          foundMsgId = m.id;
          break;
        }
      }

      if (!foundBlock || !foundMsgId) {
        console.warn(`[useEngine.handlePendingInputSubmit] inputId not found: ${inputId}`);
        return;
      }

      // Flip to 'submitting' so the form disables + shows the spinner.
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== foundMsgId) return m;
          const next = markPendingInputStatus(m.timeline, inputId, { status: 'submitting' });
          return next === m.timeline ? m : { ...m, timeline: next };
        }),
      );

      try {
        // Reconstruct the full PendingInput wire payload from the block
        // — the engine expects the whole object back so it can pop
        // assistantContent + completedResults onto the message history.
        const pendingInput = {
          type: 'pending_input' as const,
          inputId: foundBlock.inputId,
          toolName: foundBlock.toolName,
          toolUseId: foundBlock.toolUseId,
          schema: foundBlock.schema,
          description: foundBlock.description,
          assistantContent: foundBlock.assistantContent,
          completedResults: foundBlock.completedResults,
        };

        const res = await fetch('/api/engine/resume-with-input', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-zklogin-jwt': jwt,
          },
          body: JSON.stringify({
            address,
            sessionId,
            pendingInput,
            values,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null) as
            | { error?: string; fieldErrors?: Record<string, string> }
            | null;
          const errorMessage = errBody?.error
            ? `${errBody.error}${
                errBody.fieldErrors
                  ? ` — ${Object.values(errBody.fieldErrors).join('; ')}`
                  : ''
              }`
            : `HTTP ${res.status}`;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== foundMsgId) return m;
              const next = markPendingInputStatus(m.timeline, inputId, {
                status: 'error',
                errorMessage,
              });
              return next === m.timeline ? m : { ...m, timeline: next };
            }),
          );
          return;
        }

        // [P9.4 host minimal] Mark submitted; the resumed-turn SSE
        // round-trip wiring (stream the response into the same
        // assistant message + flip to `done`) ships in P9.6 alongside
        // the engine v1.18.0 release. For now, the form collapses to
        // the confirmation row and the user can send a new chat
        // message to nudge the agent.
        //
        // We still consume the response stream (closing it explicitly
        // so the server can shut down its keep-alive) — just don't
        // process events into the timeline yet.
        try {
          const reader = res.body?.getReader();
          while (reader) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch {
          /* swallow — stream-close is best-effort */
        }

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== foundMsgId) return m;
            const next = markPendingInputStatus(m.timeline, inputId, {
              status: 'submitted',
              submittedValues: values,
            });
            return next === m.timeline ? m : { ...m, timeline: next };
          }),
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Network error';
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== foundMsgId) return m;
            const next = markPendingInputStatus(m.timeline, inputId, {
              status: 'error',
              errorMessage,
            });
            return next === m.timeline ? m : { ...m, timeline: next };
          }),
        );
      }
    },
    [sessionId, jwt, address],
  );

  const handleRegenerate = useCallback(
    async (action: PendingAction) => {
      if (!sessionId || !jwt || !address) return;
      const targetAttemptId = action.attemptId;
      if (!targetAttemptId) return;
      if (regeneratingAttemptIds.has(targetAttemptId)) return;

      setRegeneratingAttemptIds((prev) => {
        const next = new Set(prev);
        next.add(targetAttemptId);
        return next;
      });
      setError(null);

      try {
        const res = await fetch('/api/engine/regenerate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-zklogin-jwt': jwt,
          },
          body: JSON.stringify({
            address,
            sessionId,
            attemptId: targetAttemptId,
          }),
        });

        const body = (await res.json().catch(() => null)) as
          | {
              success: true;
              newPendingAction: PendingAction;
              timelineEvents: RegenerateTimelineEvent[];
            }
          | (RegenerateFailure & { success: false })
          | null;

        if (!res.ok || !body || body.success !== true) {
          const reason: RegenerateFailure['reason'] =
            body && body.success === false ? body.reason : 'engine_error';
          setError(REGEN_ERROR_COPY[reason] ?? REGEN_ERROR_COPY.engine_error);
          return;
        }

        // Build a single `RegeneratedTimelineBlock` carrying every
        // re-fired read as a child `ToolTimelineBlock` (so each renders
        // its own rich result card via `ToolBlockView`). Timeline events
        // arrive paired (`tool_start` then `tool_result`) per spec; we
        // index by `toolUseId` to merge into one block per read.
        //
        // [SPEC 7 P2.4b audit fix — BUG #6] Per-tool startedAt is rebased
        // off `event.durationMs` so `ToolBlockView`'s
        // `(endedAt - startedAt) / 1000` header reads the real duration.
        // Previously both timestamps were pinned to the same `now`, so
        // every tool reported "0.0s" in the regenerated group while the
        // group label correctly summed to (e.g.) "1.4s".
        const childByToolUseId = new Map<string, ToolTimelineBlock>();
        let totalDurationMs = 0;
        const now = Date.now();
        for (const ev of body.timelineEvents) {
          if (ev.type === 'tool_start') {
            childByToolUseId.set(ev.toolUseId, {
              type: 'tool',
              toolUseId: ev.toolUseId,
              toolName: ev.toolName,
              input: ev.input,
              status: 'running',
              startedAt: now,
            });
          } else {
            const existing = childByToolUseId.get(ev.toolUseId) ?? {
              type: 'tool' as const,
              toolUseId: ev.toolUseId,
              toolName: ev.toolName,
              input: undefined,
              status: 'running' as const,
              startedAt: now,
            };
            const durationMs = Number.isFinite(ev.durationMs) ? ev.durationMs : 0;
            childByToolUseId.set(ev.toolUseId, {
              ...existing,
              status: ev.isError ? 'error' : 'done',
              startedAt: now - durationMs,
              endedAt: now,
              result: ev.result,
              isError: ev.isError,
            });
            totalDurationMs += durationMs;
          }
        }
        const toolBlocks = Array.from(childByToolUseId.values());
        const regeneratedBlock: RegeneratedTimelineBlock = {
          type: 'regenerated',
          durationMs: totalDurationMs,
          toolBlocks,
          originalAttemptId: targetAttemptId,
        };

        const newAction = body.newPendingAction;
        setMessages((prev) =>
          prev.map((m) => {
            // Match on the message that holds the (now-stale)
            // pending_action. Any other engine message is left alone.
            if (
              !m.pendingAction ||
              m.pendingAction.attemptId !== targetAttemptId
            ) {
              return m;
            }
            // Swap in the fresh action so the renderers (legacy
            // PermissionCard via `pendingAction`, new path via the
            // permission-card timeline block) both see the new
            // attemptId, fresh quoteAge, and updated step list.
            const nextTimeline = updateTimelineForRegenerate(
              m.timeline,
              targetAttemptId,
              newAction,
              regeneratedBlock,
            );
            return {
              ...m,
              pendingAction: newAction,
              timeline: nextTimeline,
            };
          }),
        );
      } catch (err) {
        console.error('[useEngine] regenerate failed:', err);
        setError(REGEN_ERROR_COPY.engine_error);
      } finally {
        setRegeneratingAttemptIds((prev) => {
          if (!prev.has(targetAttemptId)) return prev;
          const next = new Set(prev);
          next.delete(targetAttemptId);
          return next;
        });
      }
    },
    [address, jwt, sessionId, regeneratingAttemptIds],
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

    // [Phase 0 / SPEC 13 / 2026-05-03 evening] Client-side breadcrumb for
    // the "Response interrupted · retry" bug. Pairs with the server-side
    // `[engine/chat] STREAM_CLOSED_SILENTLY` log + engine.turn_outcome
    // counter. When this fires AND the server log shows a clean
    // `turn_complete`, the gap is in the SSE-delivery layer (CDN, fetch
    // streaming, parser) not the engine. When this fires AND the server
    // log ALSO shows STREAM_CLOSED_SILENTLY, the gap is upstream.
    try {
      // eslint-disable-next-line no-console
      console.warn('[useEngine] INTERRUPTED_TURN_DETECTED', {
        msgId,
        turnCompleteSeen: turnCompleteSeenRef.current,
        pendingActionSeen: pendingActionSeenRef.current,
        replayTextLen: replayText.length,
        timelineBlockCount:
          (() => {
            const m = messagesRef.current.find((x) => x.id === msgId);
            const t = m?.timeline as unknown;
            const blocks = (t as { blocks?: unknown[] } | undefined)?.blocks;
            return Array.isArray(blocks) ? blocks.length : 0;
          })(),
      });
    } catch {
      // Logging must never throw.
    }

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

    // [SPEC 15 Phase 2] Audric-only `expects_confirm` event — emitted
    // from the chat route's `case 'turn_complete'` decorator just
    // before the engine's `turn_complete` SSE forwards. Stamps the
    // streaming assistant message with chip data so `<ChatMessage>`
    // can render `<ConfirmChips />` underneath. Frontend-render gating
    // happens in `<ChatMessage>` (env flag check) — at the reducer
    // layer we always stash the payload so the field stays accurate
    // for telemetry / debugging even when chips are flag-OFF.
    if (eventType === 'expects_confirm') {
      try {
        const parsed = JSON.parse(dataStr) as {
          variant?: string;
          stashId?: unknown;
          expiresAt?: unknown;
          stepCount?: unknown;
        };
        // Defensive shape validation — server is the source of truth
        // but we don't want a malformed event to crash the reducer.
        const variant = parsed.variant;
        const stashId = parsed.stashId;
        const stepCount = parsed.stepCount;
        if (
          (variant === 'commit' || variant === 'acknowledge' || variant === 'choice') &&
          typeof stashId === 'string' &&
          stashId.length > 0 &&
          typeof stepCount === 'number'
        ) {
          const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined;
          const msgId = streamingMsgRef.current;
          if (!msgId) return;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    expectsConfirm: {
                      variant,
                      stashId,
                      expiresAt,
                      stepCount,
                    },
                  }
                : m,
            ),
          );
        }
      } catch { /* ignore — non-fatal */ }
      return;
    }

    // [SPEC 9 v0.1.3 P9.4] Cast as `AudricSSEEvent` (engine SSE union
    // ∪ audric-only events). The raw JSON shape from the wire matches
    // the audric union by construction — engine-emitted events include
    // the new typed `pending_input` shape (post-engine-fix; the npm
    // 1.17.1 emits the older shape but the reducer no-ops on it).
    let event: AudricSSEEvent;
    try {
      event = JSON.parse(dataStr) as AudricSSEEvent;
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
        // [SPEC 9 v0.1.3 P9.4] Legacy per-message accumulator. The v2
        // timeline path consumes the same event via the
        // `pending-input` TimelineBlock — this list is dual-write
        // for any legacy renderer still reading `m.pendingInputs[]`.
        // Round-trip fields stay engine-internal here (the timeline
        // block carries them; this slim summary doesn't need them).
        const input = {
          inputId: event.inputId,
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          schema: event.schema,
          description: event.description,
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
    //
    // [SPEC 7 P2.5b] `contacts` is read from the ref at event-emit
    // time so the synthetic contact-resolved rows reflect the latest
    // contacts list (an add/edit during a streaming turn surfaces
    // immediately on the next event).
    const now = Date.now();
    const contactsSnapshot = contactsRef.current;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const next = applyEventToTimeline(m.timeline, event, now, {
          contacts: contactsSnapshot,
        });
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
    sendChipDecision,
    resolveAction,
    cancel,
    retry,
    clearMessages,
    loadSession,
    injectMessage,
    canRetry: !!lastFailedMessage.current,
    isStreaming: status === 'streaming' || status === 'connecting' || status === 'executing',
    // [SPEC 7 P2.4b] Quote-Refresh — `<UnifiedTimeline>` threads these
    // down to `<ChatMessage>` → `<ReasoningTimeline>` → `<BlockRouter>`
    // → `<PermissionCardBlockView>` (and the legacy path equivalent).
    handleRegenerate,
    regeneratingAttemptIds,
    // [SPEC 9 v0.1.3 P9.4] Inline-form submit — same prop chain as
    // handleRegenerate above, but for `<PendingInputBlockView>` and
    // its `onPendingInputSubmit` slot.
    handlePendingInputSubmit,
  };
}
