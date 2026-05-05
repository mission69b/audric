/**
 * Audric-side SSE event types (Phase 2 chips + future variants).
 *
 * Engine-emitted events live in `@t2000/engine`'s `SSEEvent` discriminated
 * union. THIS file holds the audric-only events that the chat route emits
 * IN ADDITION to engine events — currently `expects_confirm`, used by SPEC
 * 15 Phase 2 to tell the frontend "render Confirm/Cancel chips below the
 * most recent assistant message in this turn."
 *
 * Why audric-only and not in `@t2000/engine`:
 *   Phase 2 v1 ships only to audric/web. CLI / MCP hosts don't render
 *   chips. Putting the type in the engine package would force every
 *   consumer to know about a feature only one of them uses, plus require
 *   an engine release on every UI change. If a future "Phase 2.5" cross-
 *   host port is needed, this type promotes cleanly to an engine
 *   `EngineEvent` member without breaking the audric wire format.
 *
 * Frontend consumers should treat any unknown event-type as a no-op
 * (Phase 1.5's reducer pattern). This way, dropping a new audric-only
 * event into the stream is non-breaking.
 *
 * Cross-references:
 *   - `expects-confirm-decorator.ts` — produces ExpectsConfirmSseEvent
 *   - `app/api/engine/chat/route.ts` — emits the event before turn_complete
 *   - `spec/SPEC_15_PHASE2_DESIGN.md` — design doc (gitignored)
 */

/**
 * Variant tag on `ExpectsConfirmSseEvent`. Phase 2 v1 ships ONLY 'commit'
 * (the bundle Confirm/Cancel case). 'acknowledge' (single dismiss) and
 * 'choice' (N options) are explicitly Phase 2.5+ and not yet a runtime
 * surface — they're typed here only to make future adds non-breaking.
 *
 * Implementer note: a frontend that doesn't know about a future variant
 * should fall through to free-text input (the Phase 1+1.5 path). Never
 * crash on an unknown variant.
 */
export type ExpectsConfirmVariant = 'commit' | 'acknowledge' | 'choice';

/**
 * Audric-only SSE event emitted by `/api/engine/chat` AFTER the assistant
 * turn streams and BEFORE `turn_complete`. Tells the frontend that the
 * just-finished assistant message expects a structured response (currently
 * always: chip click against a stashed bundle proposal).
 *
 * Lifecycle:
 *   1. Engine emits text deltas → assistant message takes shape.
 *   2. Engine emits `turn_complete` (engine-side, not this event).
 *   3. Audric chat route runs `expectsConfirmDecorator(...)`.
 *   4. If the decorator returns non-null, the route emits this event.
 *   5. Frontend's SSE reducer attaches the payload to the most recent
 *      assistant message, which triggers `<ConfirmChips />` render.
 *
 * Auth model:
 *   `stashId` is echoed back on the chip-click POST as `forStashId` for
 *   TELEMETRY ONLY. The server consumes the stash by `sessionId` (the
 *   stash itself carries `walletAddress` and is matched against the
 *   POST's wallet — see fast-path-bundle.ts wallet_mismatch skip).
 *   `stashId` is NOT a capability token.
 */
export interface ExpectsConfirmSseEvent {
  type: 'expects_confirm';
  /** Phase 2 v1 ships 'commit' only. */
  variant: ExpectsConfirmVariant;
  /**
   * Bundle stash ID (== `BundleProposal.bundleId`). Frontend echoes this
   * on the chip-click POST as `forStashId` for telemetry/log correlation.
   * NOT used for auth — the server keys stash consumption on `sessionId`.
   */
  stashId: string;
  /**
   * Wall-clock expiry (epoch ms). Set on swap-bearing bundles (where
   * Cetus quote staleness matters); undefined for non-swap bundles which
   * never expire client-side. Past this time, frontend greys out the
   * Confirm chip and shows "Quote expired" — but the chip-click path
   * still works (server falls through to plan-context promotion → Sonnet
   * re-quote).
   */
  expiresAt?: number;
  /**
   * Number of writes in the bundle (== `BundleProposal.steps.length`).
   * Surfaced in the chip's a11y label: "Confirm Payment Intent — 3
   * operations".
   */
  stepCount: number;
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.1 P9.2 — Proactive insight blocks
//
// Engine emits `proactive_text` AFTER the assistant's text deltas have
// streamed when it parsed a `<proactive type="..." subjectKey="...">…</proactive>`
// marker around the response body. The host's timeline-builder reducer
// strips the wrapper from the latest `TextTimelineBlock.text` and stamps
// `proactive` metadata onto it so `<TextBlockView>` can render the
// `✦ ADDED BY AUDRIC` lockup styling.
//
// Lives here (audric-only) until @t2000/engine v1.18.0 promotes
// `proactive_text` into the engine's `SSEEvent` union — at which point
// this type and the local re-export below are deleted in favour of the
// engine's canonical version. The wire shape MUST stay identical so the
// promotion is a no-op for hosts.
// ───────────────────────────────────────────────────────────────────────────

export type ProactiveType =
  | 'idle_balance'
  | 'hf_warning'
  | 'apy_drift'
  | 'goal_progress';

export interface ProactiveTextSseEvent {
  type: 'proactive_text';
  /** Closed list — see `ProactiveType` and the system prompt allow-list. */
  proactiveType: ProactiveType;
  /**
   * Stable per-subject id chosen by the LLM (`USDC`, `1.45`, `save-500-by-may`).
   * Same `(proactiveType, subjectKey)` pair won't fire twice in one session
   * — the engine maintains a per-instance cooldown set keyed on this pair.
   */
  subjectKey: string;
  /** Marker body (already stripped of the wrapper tags). */
  body: string;
  /**
   * `true` when the cooldown set already contains the pair — host renders
   * as a plain text block (no lockup, no italic, no border). `false` on
   * the first sighting in a session — host renders with full lockup
   * styling.
   */
  suppressed: boolean;
  /**
   * How many `<proactive>` markers the engine parsed in this text block.
   * Should always be 1; >1 means the LLM violated the "max one block per
   * turn" rule and the engine logged a violation counter.
   */
  markerCount: number;
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.3 P9.4 — `pending_input` inline-form primitive
//
// Engine emits this event when a tool's preflight returns `needsInput`.
// The host renders an inline form keyed on `schema.fields[].kind`, the
// user submits, the host POSTs values to `/api/engine/resume-with-input`,
// the route validates + resolves polymorphic identifiers + persists side
// effects, then calls `engine.resumeWithInput()` to continue the turn.
//
// Lives here (audric-only) until @t2000/engine v1.18.0 promotes
// `pending_input` (with the new typed `FormSchema`) and the
// `engine.resumeWithInput()` method into the published package — at
// which point this section is deleted in favour of the engine's
// canonical version. The wire shape MUST stay identical.
//
// SPEC 8 v0.5.1 D2 reserved the SSEEvent type with `schema: unknown`;
// this typing tightens it to `FormSchema` and adds `toolName` /
// `toolUseId` / `description`. Forward-compatible with hosts that
// already no-op'd on the legacy reservation.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Closed list of typed input-field kinds the host renderer supports.
 * Each kind maps to a dedicated React component (one per kind) so we
 * don't drift between server-side schema validation and client-side
 * rendering. Adding a new kind requires a coordinated host renderer +
 * engine MINOR version bump.
 *
 * Kinds:
 *   - `text`           — plain string. <input type="text">.
 *   - `sui-recipient`  — polymorphic identifier (Audric handle / external
 *                        SuiNS / bare 0x). Server-side normalization
 *                        happens in the resume endpoint via
 *                        `normalizeAddressInput`. v0.1.3 R6 renamed
 *                        from `address` because the field accepts
 *                        names + handles, not just addresses.
 *   - `number`         — numeric input. Host parses to Number; engine
 *                        receives a JS number.
 *   - `usd`            — numeric formatted as USD ($1,234.56). Host
 *                        renders a $ prefix + 2dp formatter; engine
 *                        receives the raw number.
 *   - `select`         — closed-set choice. <select> rendered against
 *                        `options[]`.
 *   - `date`           — ISO-8601 (YYYY-MM-DD). <input type="date">.
 */
export type FormFieldKind =
  | 'text'
  | 'sui-recipient'
  | 'number'
  | 'usd'
  | 'select'
  | 'date';

/** One row in a `pending_input` form. */
export interface FormField {
  /** Input key on the resumed-tool input object (e.g. `name`, `identifier`). */
  name: string;
  /** User-facing label rendered above the input. */
  label: string;
  /** Renderer discriminator. */
  kind: FormFieldKind;
  /** When true, host blocks submit while the value is empty/null. */
  required: boolean;
  /** Optional grey-text hint inside the empty input. */
  placeholder?: string;
  /** Optional help text rendered below the input (small font). */
  helpText?: string;
  /**
   * Required for `kind: 'select'`. Closed-set choices. `value` is what
   * gets sent back; `label` is what's rendered. Ignored for non-select
   * kinds.
   */
  options?: Array<{ value: string; label: string }>;
}

/** Top-level form payload carried on `pending_input`. */
export interface FormSchema {
  fields: FormField[];
}

/**
 * Audric-only `pending_input` SSE event. Wire shape mirrors the engine's
 * canonical event (which v1.18.0 promotes); local copy here keeps the
 * reducer / form renderer / route handler typed strictly while audric
 * pins to engine 1.17.1.
 *
 * The round-trip fields (`assistantContent` / `completedResults`) ride
 * on the same payload so stateless hosts (request-scoped engines like
 * audric's) can persist + echo back on resume. The reducer ignores
 * them; only the chat-route persistence + resume-with-input route care.
 * Mirrors the `pending_action.action.{assistantContent,completedResults}`
 * round-trip pattern.
 */
export interface PendingInputSseEvent {
  type: 'pending_input';
  /** UUID v4 stamped per emit by the engine. Host posts back keyed on this. */
  inputId: string;
  /** Tool that requested the input. Used for debug logs + fallback caption. */
  toolName: string;
  /** Original `tool_use_id` from the LLM's call — preserved for the resumed tool_result. */
  toolUseId: string;
  /** Typed form schema — host renderer keys on `field.kind` per row. */
  schema: FormSchema;
  /** Optional human-readable description rendered above the form. */
  description?: string;
  /**
   * Assistant blocks captured at pause time. Host persists with the
   * rest of the payload; resume-with-input echoes back to the engine.
   * Type-erased to `unknown[]` so the wire stays loose-coupled to the
   * engine's `ContentBlock` definition.
   */
  assistantContent: unknown[];
  /** Tool results from earlier same-turn reads. */
  completedResults: Array<{
    toolUseId: string;
    content: string;
    isError: boolean;
  }>;
}
