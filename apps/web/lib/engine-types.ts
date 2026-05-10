import type {
  SSEEvent,
  PendingAction,
  TodoItem,
  EvaluationItem,
  FormSchema,
} from '@t2000/engine';

export type { SSEEvent, PendingAction, TodoItem, EvaluationItem, FormSchema };

/**
 * Audric-extended SSE event union.
 *
 * As of @t2000/engine v1.19.0 (P9.6 release) the `pending_input` and
 * `proactive_text` events are native members of the engine's `SSEEvent`
 * union with their fully-typed shapes. This alias is kept as the canonical
 * type imported by reducers (`timeline-builder.ts`, `useEngine.ts`) so a
 * future audric-only event can be added here without touching every
 * call-site. Today it's a straight re-export.
 */
export type AudricSSEEvent = SSEEvent;

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
  /**
   * [SPEC 9 v0.1.1 P9.2] Set when the engine emitted a `proactive_text`
   * SSE event whose content overlaps this block — i.e. the LLM wrapped
   * its response in a `<proactive type="..." subjectKey="...">…</proactive>`
   * marker. When `suppressed === false`, render with the
   * `✦ ADDED BY AUDRIC` lockup styling (italic body + dim border-left
   * accent + lockup badge) to flag this as an unsolicited insight, not
   * a direct answer to the user's question. When `suppressed === true`
   * (per-session cooldown hit — same `(type, subjectKey)` already
   * fired this session), strip the wrapper from `text` for display
   * but render as a plain text block — narrative still flows, the
   * lockup just doesn't fire twice.
   *
   * Telemetry counters are bumped engine-side via the `getTelemetrySink`
   * pathway; the host's renderer is purely presentational here.
   */
  proactive?: {
    proactiveType: 'idle_balance' | 'hf_warning' | 'apy_drift' | 'goal_progress';
    subjectKey: string;
    suppressed: boolean;
  };
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
 * [SPEC 9 v0.1.3 P9.4] Inline-form timeline block.
 *
 * Created by `timeline-builder` when the engine yields a `pending_input`
 * SSE event. `<PendingInputBlockView>` renders an inline form keyed on
 * `schema.fields[].kind`, the user submits, the host POSTs values to
 * `/api/engine/resume-with-input` keyed on `inputId`. The engine's
 * `resumeWithInput()` then runs the paused tool with the validated
 * values + continues the agent loop in a fresh SSE stream.
 *
 * Status field tracks the form's local UX state — distinct from the
 * engine's pause-on-input state (which is on the wire `inputId`). When
 * `status === 'submitting'` the form's submit button shows a spinner
 * and the inputs disable; when `status === 'submitted'` the form
 * collapses to a one-line confirmation row ("Submitted: Mom →
 * mom.audric.sui") so the next assistant narration stays the focal
 * point. `status === 'error'` re-shows the form with an inline error.
 *
 * Round-trip fields (`assistantContent` / `completedResults`) ride on
 * the block so the resume POST can echo back the FULL `PendingInput`
 * payload to the engine. Mirrors how `<PermissionCardBlockView>`
 * carries the full `PendingAction` for its resume call. The renderer
 * doesn't read them — they're host-only plumbing.
 */
export interface PendingInputTimelineBlock {
  type: 'pending-input';
  /** UUID v4 from the engine. The resume POST echoes this back. */
  inputId: string;
  /** Tool that requested the input. */
  toolName: string;
  /** Original `tool_use_id` — round-trips back through the resume call. */
  toolUseId: string;
  /** Typed form schema (closed list of field kinds). */
  schema: FormSchema;
  /** Optional caption rendered above the form. */
  description?: string;
  /** Local UX state machine — independent of engine pause. */
  status: 'pending' | 'submitting' | 'submitted' | 'error';
  /** Inline error message when `status === 'error'` (resume failed). */
  errorMessage?: string;
  /**
   * The submitted values, captured AFTER successful submit so the
   * collapsed-confirmation row can render "Submitted: Mom →
   * mom.audric.sui" without re-asking the form. Cleared on re-mount.
   */
  submittedValues?: Record<string, unknown>;
  /**
   * Round-trip state from the engine's pause snapshot — captured here
   * so the resume POST can echo back the full `PendingInput` payload
   * to `engine.resumeWithInput()`. Renderer ignores. Type-erased to
   * `unknown[]` to mirror the engine's wire shape (no ContentBlock
   * import dependency).
   */
  assistantContent: unknown[];
  /** Tool results from earlier same-turn reads (for atomic resume). */
  completedResults: Array<{
    toolUseId: string;
    content: string;
    isError: boolean;
  }>;
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
/**
 * [SPEC 7 P2.5b Layer 5] Synthetic "PLAN" planning row that
 * appears as the FINAL row before a multi-step Payment Intent
 * `permission-card` block. Indicates the agent has finished evaluating
 * the upstream reads / contact resolution / etc. and has compiled
 * everything into one atomic Payment Intent. Pushed by
 * `applyEventToTimeline` on `pending_action` events whose action carries
 * `steps.length >= 2`. Single-write actions never get a plan row (the
 * existing `pre-write` thinking + `<eval_summary>` already serve that
 * purpose for single-write confirms).
 *
 * Status is always `'done'` at emission time — by the moment the
 * engine yields `pending_action`, the planning IS the intent. Modeling
 * this as a static row (not running → done) keeps the timeline
 * deterministic and avoids a hung "PLAN …" indicator if the user
 * navigates away mid-card. The row is purely a typed visual separator
 * that says "the agent compiled what comes next into one atomic intent."
 *
 * (The interface name is preserved for type-import stability — only
 * the user-facing label was renamed in 2026-05-05.)
 */
export interface PlanStreamTimelineBlock {
  type: 'plan-stream';
  /** Number of composable writes packaged into the intent (≥2). */
  stepCount: number;
  /** attemptId of the intent this PLAN row precedes. */
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
 * parent level (atomic Payment Intent ⇒ one digest for all legs).
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
 * Payment Intent. Replaces the pre-fix UX where N atomic legs
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
  /** Shared Payment Intent digest (set when the user-confirmation round-trip succeeds). */
  txDigest?: string;
  /** Per-leg outcomes; ordered to match the PermissionCard's step order. */
  legs: BundleReceiptLeg[];
  /** Wallclock ms at insertion (always equal to `endedAt` since atomicity). */
  startedAt: number;
  endedAt: number;
  /**
   * `true` iff ANY leg's `isError` is true OR the executor returned
   * `_bundleReverted`. Atomic Payment Intent semantics ⇒ all-success or
   * all-failure on-chain, but the host's `executeBundleAction`
   * marks every leg `isError: true` on revert (see
   * `executeToolAction.ts`), so any single errored leg signals the
   * whole bundle reverted.
   */
  isError: boolean;
  /**
   * [S.122] True iff the bundle failed because the user's zkLogin session
   * expired (Enoki sponsor returned 401 with `code: 'session_expired'`).
   * Distinct from `isError` (on-chain Payment Intent revert): nothing
   * reached chain so the receipt UI surfaces "SESSION EXPIRED · NOT
   * SUBMITTED" + a "Sign back in" CTA, NOT "PAYMENT INTENT REVERTED ·
   * ATOMICALLY FAILED" (which incorrectly implied to the user that we
   * tried to send a tx that then failed). The `isError` flag is also
   * true when this is set (so legacy renderers still show the failure
   * state); session-expired just refines WHAT to show.
   */
  sessionExpired?: boolean;
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

/**
 * [SPEC 9 v0.1.3 P9.4] Legacy shape used by the per-message
 * `pendingInputs[]` accumulator on `EngineChatMessage`. Today the v2
 * timeline path consumes `pending_input` directly via the
 * `pending-input` TimelineBlock — this list survives only for legacy
 * (pre-SPEC-8) renderers. Promoted from the SPEC 8 D2 reservation
 * (`schema: unknown` + `prompt?: string`) to the typed shape so both
 * paths share the same wire contract.
 */
export interface PendingInputEvent {
  inputId: string;
  toolName: string;
  toolUseId: string;
  schema: FormSchema;
  description?: string;
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
   * — i.e. the message proposed a multi-write Payment Intent plan
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
  /**
   * [SPEC 21.1] Current stream-state for the choreography chip.
   * Driven by:
   *  - Engine-emitted `routing` (before swap_quote) and `quoting`
   *    (after swap_quote returns) — see `withStreamState` in
   *    `@t2000/engine`.
   *  - Audric-emitted `confirming` (client posts to /prepare),
   *    `settling` (sponsor returned, awaiting waitForTransaction),
   *    `done` (tx confirmed) — set by `executeToolAction`.
   *
   * Reset to `null` on `turn_complete` (and on the next user message
   * — handled implicitly because new assistant messages start with
   * the field unset).
   *
   * Rendered by `<TransitionChip>` ONLY when
   * `NEXT_PUBLIC_HARNESS_TRANSITIONS_V1` is set (D-3 lock = staged
   * rollout). Older clients ignore the field; the chip never renders.
   *
   * Typed as the literal union (not imported from `@t2000/engine`)
   * to avoid a type-import cycle in this leaf type module.
   */
  transitionState?: 'routing' | 'quoting' | 'confirming' | 'settling' | 'done' | null;
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
