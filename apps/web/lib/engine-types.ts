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

/**
 * [SPEC 7 P2.4b] "↻ Regenerated · Ns" labeled group surfacing the
 * upstream reads that re-fired during a Quote-Refresh round-trip.
 * Pushed onto the timeline by `useEngine.handleRegenerate` after a
 * successful POST /api/engine/regenerate; rendered immediately above
 * the new permission-card block whose `payload` got swapped in. The
 * child `toolBlocks` are rendered with the standard `ToolBlockView`
 * so each gets its existing rich result card (BalCard, RatesCard,
 * etc.) — same UX as if the LLM had re-emitted them.
 */
export interface RegeneratedTimelineBlock {
  type: 'regenerated';
  /**
   * Sum of every child's `tool_result.durationMs`. Drives the
   * "↻ Regenerated · 1.4s" header label.
   */
  durationMs: number;
  /** Embedded child tool blocks (one per re-fired upstream read). */
  toolBlocks: ToolTimelineBlock[];
  /**
   * The `attemptId` of the original (now-replaced) bundle. Lets the
   * rendering pipeline correlate this group with the fresh
   * permission-card block whose payload arrived in the same
   * regenerate response (e.g. "show this group above the new card,
   * collapse when its sibling card resolves").
   */
  originalAttemptId: string;
}

/**
 * [SPEC 7 P2.5b Layer 5] Synthetic "CONTACT · "<name>"" planning row
 * surfacing the resolution from a chat-mentioned contact name to its
 * on-chain address. Pushed by `applyEventToTimeline` immediately
 * before the related tool / permission-card block whenever the input
 * carries a recipient field (`to` / `recipient` / `address`) whose
 * value matches a contact in `useContacts()`. Engine-agnostic — the
 * engine continues to pass contacts silently via `EngineConfig.contacts`;
 * this block is host-side UX polish ("the agent is thinking out loud").
 *
 * `toolUseId` keys the block to the downstream tool / pending-action
 * — used by the `tool_result.resultDeduped` cleanup path to remove
 * the contact-resolved row when the early-dispatch dedup also drops
 * the tool block.
 */
export interface ContactResolvedTimelineBlock {
  type: 'contact-resolved';
  /** Display name as it appeared in the input (verbatim, NOT lowercased). */
  contactName: string;
  /** Canonical Sui address from the matched contact. */
  contactAddress: string;
  /** toolUseId of the downstream tool block (or pending_action). */
  toolUseId: string;
}

/**
 * [SPEC 7 P2.5b Layer 5] Synthetic "PLAN STREAM" planning row that
 * appears as the FINAL row before a multi-step Payment Stream
 * `permission-card` block. Indicates the agent has finished evaluating
 * the upstream reads / contact resolution / etc. and has compiled
 * everything into one atomic PTB. Pushed by `applyEventToTimeline` on
 * `pending_action` events whose action carries `steps.length >= 2`.
 * Single-write actions never get a plan-stream row (the existing
 * `pre-write` thinking + `<eval_summary>` already serve that purpose
 * for single-write confirms).
 *
 * Status is always `'done'` at emission time — by the moment the
 * engine yields `pending_action`, the planning IS the bundle. Modeling
 * this as a static row (not running → done) keeps the timeline
 * deterministic and avoids a hung "PLAN STREAM …" indicator if the
 * user navigates away mid-card. The row is purely a typed visual
 * separator that says "the agent compiled what comes next into one
 * atomic stream."
 */
export interface PlanStreamTimelineBlock {
  type: 'plan-stream';
  /** Number of bundleable writes packaged into the stream (≥2). */
  stepCount: number;
  /** attemptId of the bundle this PLAN STREAM precedes. */
  attemptId: string;
}

/**
 * [SPEC 7 P2.7 prep / Finding F6] One leg of a `bundle-receipt` block.
 * Mirrors the per-step shape of `PendingActionStep` so the receipt UI
 * can show what the user just approved with the same description text
 * shown on the PermissionCard. `result` is the per-leg payload from the
 * sponsored-tx flow (each leg's row in `executeBundleAction`'s
 * `stepResults`); the host extracts whatever per-leg detail it can
 * (e.g. a swap's destination amount) but the txDigest lives at the
 * parent level (atomic PTB ⇒ one digest for all legs).
 */
export interface BundleReceiptLeg {
  toolName: string;
  toolUseId: string;
  /** Mirrors `PendingActionStep.description` from the original action. */
  description: string;
  isError: boolean;
  result?: unknown;
}

/**
 * [SPEC 7 P2.7 prep / Finding F6] Single receipt for a multi-leg
 * Payment Stream PTB. Replaces the pre-fix UX where N atomic legs
 * rendered N separate `tool` blocks → N `TransactionReceiptCard`s →
 * N "View on Suiscan" links pointing to the SAME digest. Now: ONE
 * `bundle-receipt` block, one Suiscan link, atomicity language
 * mirroring the pre-execution `PlanStreamTimelineBlock`.
 *
 * Inserted by `mergeBundleExecutionIntoTimeline` from
 * `useEngine.resolveAction` immediately AFTER the resolved
 * permission-card on bundle approve. Bundles with `steps.length < 2`
 * fall through to the existing single-write path
 * (`mergeWriteExecutionIntoTimeline`).
 *
 * Engine-agnostic — the engine continues to yield N `tool_result`
 * SSE events on bundle resume; the timeline reducer's `tool_result`
 * branch silently no-ops on those (idx === -1) because we don't
 * create per-step `tool` blocks anymore. The on-chain state is
 * already reflected in the synthesized bundle-receipt at the moment
 * the user-confirmation round-trip returns, so the redundant SSE
 * `tool_result`s are LLM-side bookkeeping only.
 */
export interface BundleReceiptTimelineBlock {
  type: 'bundle-receipt';
  /** Mirrors the parent bundle's `attemptId` (top-level on PendingAction). */
  attemptId: string;
  /** Shared PTB digest (set when the user-confirmation round-trip succeeds). */
  txDigest?: string;
  /** Per-leg outcomes; ordered to match the PermissionCard's step order. */
  legs: BundleReceiptLeg[];
  /** Wallclock ms at insertion (always equal to `endedAt` since atomicity). */
  startedAt: number;
  endedAt: number;
  /**
   * `true` iff ANY leg's `isError` is true OR the executor returned
   * `_bundleReverted`. Atomic PTB semantics ⇒ all-success or
   * all-failure on-chain, but the host's `executeBundleAction`
   * marks every leg `isError: true` on revert (see
   * `executeToolAction.ts`), so any single errored leg signals the
   * whole bundle reverted.
   */
  isError: boolean;
}

export type TimelineBlock =
  | ThinkingTimelineBlock
  | ToolTimelineBlock
  | TextTimelineBlock
  | TodoTimelineBlock
  | CanvasTimelineBlock
  | PermissionCardTimelineBlock
  | PendingInputTimelineBlock
  | RegeneratedTimelineBlock
  | ContactResolvedTimelineBlock
  | PlanStreamTimelineBlock
  | BundleReceiptTimelineBlock;

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
  /**
   * [SPEC 15 Phase 2 commit 2 / 2026-05-04] Set when this assistant
   * turn's SSE stream included an audric-only `expects_confirm` event
   * — i.e. the message proposed a multi-write Payment Stream plan
   * AND a fresh stash exists in Redis AND the final text matches the
   * plan-confirm marker. `<ChatMessage>` reads this to decide whether
   * to render `<ConfirmChips />` underneath the message body.
   *
   * Stamped from `processSSEChunk`'s `expects_confirm` handler — see
   * `apps/web/lib/engine/expects-confirm-decorator.ts` for the
   * server-side emission gate. `forStashId` is the bundleId the
   * server stashed; chip clicks echo it back so the chat route can
   * detect ghost-dispatch races (R7).
   *
   * `variant` is reserved for future multi-step confirmation shapes
   * (`acknowledge`, `choice`); v1 only emits `'commit'`.
   */
  expectsConfirm?: ExpectsConfirmPayload;
}

/**
 * [SPEC 15 Phase 2] Payload mirroring the audric-only `expects_confirm`
 * SSE event shape from `apps/web/lib/engine/sse-types.ts`. Kept as a
 * client-side type to avoid coupling the React tree to the server
 * SSE module — both files agree on the wire shape.
 */
export interface ExpectsConfirmPayload {
  /** Always `'commit'` in v1; reserved for `acknowledge` / `choice` later. */
  variant: 'commit' | 'acknowledge' | 'choice';
  /** The Redis stash bundleId — echoed back on chip click for R7 detection. */
  stashId: string;
  /**
   * Unix ms when the underlying swap quote goes stale, when the bundle
   * contains a `swap_execute` step. Undefined for non-swap bundles.
   * `<ConfirmChips />` disables both buttons + shows "Quote expired"
   * once `Date.now() >= expiresAt`.
   */
  expiresAt?: number;
  /** Mirrored on the SSE event for telemetry — `<ConfirmChips />` ignores it today. */
  stepCount: number;
  /**
   * [v0.5 — Refresh-on-expiry intent replay] The literal user message
   * text that triggered THIS plan turn — captured client-side by the
   * SSE reducer (walks back through `messagesRef.current` for the
   * immediately preceding `role: 'user'` entry). The Refresh chip
   * replays this verbatim so plan-context promotion + chat history
   * unambiguously re-runs `swap_quote` + `prepare_bundle` (vs. the
   * literal "refresh quote" text which Sonnet correctly interpreted
   * as quote-only — production-confirmed gap, 2026-05-04).
   *
   * Optional for backward-compat with pre-v0.5 messages persisted
   * mid-rollout; falls back to `'refresh quote'` if missing.
   */
  originatingUserText?: string;
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
