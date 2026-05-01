import type { SSEEvent, PendingAction, TodoItem, EvaluationItem } from '@t2000/engine';

export type { SSEEvent, PendingAction, TodoItem, EvaluationItem };

export interface CanvasData {
  template: string;
  title: string;
  data: unknown;
  toolUseId: string;
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — TimelineBlock taxonomy (B2.1)
//
// The timeline is an ordered list of typed blocks built incrementally from
// SSE events as they stream. Replaces the "tools section first → thinking
// accordion → text last" layout with chronological emission order.
//
// Two-phase rollout:
//   B2.1 (this commit) — define the model, dual-write from SSE, render NOTHING
//                        (gated by NEXT_PUBLIC_INTERACTIVE_HARNESS flag, default OFF)
//   B2.2 (next commit) — ReasoningTimeline component reads timeline[] when flag ON;
//                        flag OFF still uses today's ReasoningAccordion + tools rows
//
// Block lifecycle status:
//   - 'streaming' — block is currently receiving deltas (thinking, text)
//   - 'running'   — tool is in flight (between tool_start and tool_result)
//   - 'done'      — terminal success state
//   - 'error'     — terminal error state
//   - 'interrupted' — set by the rehydrate path on disconnect (B3 territory)
// ───────────────────────────────────────────────────────────────────────────

export type BlockStatus = 'streaming' | 'running' | 'done' | 'error' | 'interrupted';

/**
 * One per Anthropic thinking block (matched by `blockIndex`). Multiple
 * thinking blocks per turn = multi-burst thinking. When the LLM emits
 * an `<eval_summary>` marker inside, `summaryMode` flips and
 * `evaluationItems` populates — host renders HowIEvaluated card instead
 * of raw thinking text.
 */
export interface ThinkingTimelineBlock {
  type: 'thinking';
  blockIndex: number;
  text: string;
  status: BlockStatus;
  signature?: string;
  summaryMode?: boolean;
  evaluationItems?: EvaluationItem[];
}

/**
 * One per `tool_use_id`. Mutates as `tool_progress` events arrive (latest
 * progress wins) and as `tool_result` lands (status flips to done/error).
 * `attemptCount` carries through for tool retries (SPEC 8 v0.3 G5).
 */
export interface ToolTimelineBlock {
  type: 'tool';
  toolUseId: string;
  toolName: string;
  input: unknown;
  status: BlockStatus;
  startedAt: number;
  endedAt?: number;
  result?: unknown;
  isError?: boolean;
  // Latest tool_progress event for this tool, if any.
  progress?: { message: string; pct?: number };
  attemptCount?: number;
}

/** Final assistant text run. Today: 1 per turn (rare to have 2+). */
export interface TextTimelineBlock {
  type: 'text';
  text: string;
  status: BlockStatus;
}

/**
 * Sticky singleton per turn — persists across multiple `update_todo`
 * calls within the same turn. Latest items array always wins (the tool
 * is idempotent). After `turn_complete`, B2.2 renders this block as
 * "✓ N-step plan completed".
 */
export interface TodoTimelineBlock {
  type: 'todo';
  /** First toolUseId we saw — used for keying the React render cell. */
  toolUseId: string;
  items: TodoItem[];
  /** Updated each time `update_todo` fires; lets us animate transitions. */
  lastUpdatedAt: number;
}

/** One per canvas event. Same shape as the legacy CanvasData. */
export interface CanvasTimelineBlock {
  type: 'canvas';
  toolUseId: string;
  template: string;
  title: string;
  data: unknown;
}

/**
 * SPEC 7 v0.3.2 multi-step PermissionCard slot. SPEC 8 v0.5 (D1) added
 * this variant so the bundle UI has a typed home in the chronological
 * timeline. SPEC 7 owns the renderer; SPEC 8 owns only the slot type +
 * positioning. `status` reflects the user-confirm lifecycle.
 */
export interface PermissionCardTimelineBlock {
  type: 'permission-card';
  payload: PendingAction;
  status: 'pending' | 'approving' | 'regenerating' | 'denied' | 'approved';
}

/**
 * SPEC 9 v0.1.2 inline-form slot. SPEC 8 v0.5 (D2) reserved this so the
 * timeline has a typed home for the future. Engine doesn't emit
 * `pending_input` under SPEC 8; this block only appears once SPEC 9
 * lands. Today the variant exists to keep the discriminated union
 * complete (TS exhaustiveness checks B2.2's renderer).
 */
export interface PendingInputTimelineBlock {
  type: 'pending-input';
  inputId: string;
  schema: unknown;
  prompt?: string;
}

export type TimelineBlock =
  | ThinkingTimelineBlock
  | ToolTimelineBlock
  | TextTimelineBlock
  | TodoTimelineBlock
  | CanvasTimelineBlock
  | PermissionCardTimelineBlock
  | PendingInputTimelineBlock;

// [SPEC 8 v0.5.1 B1] Per-event captures from the new SSE event types.
// These shapes mirror the engine's SSEEvent union — kept local rather
// than re-exported to give the host control over rendering shape later.
export interface TodoUpdateEvent {
  items: TodoItem[];
  toolUseId: string;
}

export interface ToolProgressEvent {
  toolUseId: string;
  toolName: string;
  message: string;
  pct?: number;
}

export interface PendingInputEvent {
  schema: unknown;
  inputId: string;
  prompt?: string;
}

export interface EngineChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tools?: ToolExecution[];
  canvases?: CanvasData[];
  pendingAction?: PendingAction;
  usage?: UsageData;
  isStreaming?: boolean;
  thinking?: string;
  isThinking?: boolean;
  // [SPEC 8 v0.5.1 B1] Captured but NOT rendered yet — B2 wires the UI
  // (ReasoningTimeline, todo card, progress bars, input forms). These
  // slots exist so SPEC 8 events streaming from engine 1.4.0 don't fall
  // on the floor; today they accumulate silently.
  todoUpdates?: TodoUpdateEvent[];
  toolProgress?: ToolProgressEvent[];
  pendingInputs?: PendingInputEvent[];
  /**
   * [SPEC 8 v0.5.1 B2.1] Chronological timeline built incrementally from
   * SSE events as they stream. Read by ReasoningTimeline (B2.2) when
   * NEXT_PUBLIC_INTERACTIVE_HARNESS is ON. When OFF, this field is still
   * populated (dual-write) but no consumer reads it — the existing
   * ReasoningAccordion + tools rows render as before.
   */
  timeline?: TimelineBlock[];
  /**
   * [SPEC 8 v0.5.1 B3.2] Adaptive harness shape this assistant turn ran
   * under. Stamped from the engine's `harness_shape` SSE event (one
   * emission per turn, fired before `agentLoop` begins). Surfaces in
   * `TurnMetrics.harnessShape` for dashboard segmentation; rendered
   * verbatim in the engineering-only effort badge today (no user-facing
   * surface in B3 — telemetry-only). Undefined for legacy / pre-SPEC-8
   * turns where the engine didn't emit the event.
   */
  harnessShape?: 'lean' | 'standard' | 'rich' | 'max';
  /**
   * [SPEC 8 v0.5.1 B3.4 / Gap J] Set when this assistant turn ended
   * WITHOUT a `turn_complete` event — i.e. the SSE stream was cut off
   * by a client abort, server crash, or auth expiry mid-stream. Causes
   * `<RetryInterruptedTurn>` to render under the message so the user
   * can replay their input. The corresponding timeline blocks are also
   * flipped to status `'interrupted'` via `markTimelineInterrupted` so
   * the renderer can dim the partial output. Undefined = "completed
   * normally" (the common case).
   */
  interrupted?: boolean;
  /**
   * [SPEC 8 v0.5.1 B3.4 / Gap J] The user message text whose response
   * was interrupted. Captured at interruption time (rather than walked
   * up the messages array on render) so the retry button works even
   * after subsequent messages get appended above it. Only set together
   * with `interrupted: true`.
   */
  interruptedReplayText?: string;
  /**
   * [SPEC 8 v0.5.1 B3.2] 1-line human-readable rationale for the shape
   * decision (e.g. "matched recipe portfolio_rebalance → max"). Used in
   * Datadog logs + dashboard tooltips to explain WHY a turn picked its
   * shape without re-running the classifier.
   */
  harnessRationale?: string;
}

export interface ToolExecution {
  toolName: string;
  toolUseId: string;
  input: unknown;
  status: 'running' | 'done' | 'error';
  result?: unknown;
  isError?: boolean;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type EngineStatus = 'idle' | 'connecting' | 'streaming' | 'executing' | 'error';
