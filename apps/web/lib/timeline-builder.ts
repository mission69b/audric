// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — Timeline builder (B2.1)
//
// Pure function that takes the current TimelineBlock[] + an incoming SSE
// event + a "now" timestamp and returns the new timeline. Called from
// useEngine.processSSEChunk on every event.
//
// Design notes:
// - The function is PURE — no side effects. Same inputs → same outputs.
//   This is critical for React: each setMessages reducer call must be
//   idempotent under StrictMode's double-invoke.
// - "now" is injected so tests can pass a fixed timestamp.
// - A handful of events have no timeline impact ('usage', 'error') —
//   they return the timeline unchanged. Listed explicitly so the
//   exhaustiveness check warns when SPEC 9 adds more events.
// - We never mutate; every code path returns a fresh array (or the
//   same reference when no change is needed, to keep React happy).
//
// Block lifecycle:
//   thinking: 'streaming' (during deltas) → 'done' (on thinking_done)
//   text:     'streaming' (during deltas) → 'done' (on turn_complete)
//   tool:     'running'  (after tool_start) → 'done'/'error' (on tool_result)
//   todo:     no status — a sticky singleton that mutates as items change
//   canvas / permission-card / pending-input: stateless additions
// ───────────────────────────────────────────────────────────────────────────

import type {
  SSEEvent,
  TimelineBlock,
  ThinkingTimelineBlock,
  TextTimelineBlock,
  ToolTimelineBlock,
  TodoTimelineBlock,
  PermissionCardTimelineBlock,
  ContactResolvedTimelineBlock,
  PlanStreamTimelineBlock,
  PendingAction,
} from '@/lib/engine-types';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.5b Layer 5 — pre-bundle planning surface (contact + plan-stream).
//
// Two synthetic rows surface the agent's "thinking out loud" before a
// confirm-tier card lands:
//
//   • `contact-resolved` — when the input carries a recipient-style field
//     (`to` / `recipient` / `address`) whose string value matches a known
//     contact name (case-insensitive), inject a `CONTACT · "<name>"`
//     block immediately BEFORE the tool / permission-card block. This
//     turns the silent `EngineConfig.contacts` lookup into a visible
//     planning step (the agent acknowledges who "Mom" is, then proceeds).
//     Engine-agnostic — purely host-side UX polish.
//
//   • `plan-stream` — when `pending_action.action.steps.length >= 2`
//     (a Payment Stream bundle), inject a `PLAN STREAM` block as the
//     FINAL row before the permission-card. Marks "the agent finished
//     evaluating and compiled this into one atomic PTB". Single-write
//     confirms never get this row.
//
// Both are pure additions to the discriminated union; existing render
// paths exhaustiveness-check against the new variants in `BlockRouter`.
// ───────────────────────────────────────────────────────────────────────────

export type ContactList = ReadonlyArray<{ name: string; address: string }>;

export interface ApplyEventOptions {
  /**
   * When set, the reducer scans recipient-style input fields (`to` /
   * `recipient` / `address`) on `tool_start` and `pending_action`
   * events for contact-name matches and injects a `contact-resolved`
   * row before the tool / card block. When omitted (or empty), no
   * contact rows are injected — the timeline behaves identically to
   * pre-P2.5b.
   */
  contacts?: ContactList;
}

/** Recipient-style field names to scan for contact-name resolution. */
const RECIPIENT_FIELDS = ['to', 'recipient', 'address'] as const;

/**
 * Detect a contact-name match inside a tool input. Returns the matched
 * contact (verbatim display name + canonical address) or `null` when
 * no match. Skips values that already look like Sui addresses (`0x…`
 * — already-resolved). Case-insensitive name comparison; trims
 * whitespace.
 */
export function detectResolvedContact(
  input: unknown,
  contacts: ContactList | undefined,
): { name: string; address: string } | null {
  if (!contacts || contacts.length === 0) return null;
  if (typeof input !== 'object' || input === null) return null;

  const map = input as Record<string, unknown>;
  for (const field of RECIPIENT_FIELDS) {
    const raw = map[field];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('0x')) continue;

    const normalized = trimmed.toLowerCase();
    for (const c of contacts) {
      if (c.name.trim().toLowerCase() === normalized) {
        return { name: c.name, address: c.address };
      }
    }
  }
  return null;
}

/**
 * Apply one SSE event to a timeline and return the updated timeline.
 * The original `timeline` reference is returned unchanged when the
 * event has no timeline impact — lets React skip re-renders.
 *
 * `options.contacts` is consulted on `tool_start` and `pending_action`
 * to inject the SPEC 7 P2.5b synthetic `contact-resolved` and
 * `plan-stream` rows. Omitting it leaves pre-P2.5b behavior unchanged.
 */
export function applyEventToTimeline(
  timeline: TimelineBlock[] | undefined,
  event: SSEEvent,
  now: number,
  options?: ApplyEventOptions,
): TimelineBlock[] {
  const current = timeline ?? [];

  switch (event.type) {
    case 'thinking_delta': {
      const idx = findLastIndex(
        current,
        (b): b is ThinkingTimelineBlock =>
          b.type === 'thinking' && b.blockIndex === event.blockIndex,
      );
      if (idx === -1) {
        const block: ThinkingTimelineBlock = {
          type: 'thinking',
          blockIndex: event.blockIndex,
          text: event.text,
          status: 'streaming',
        };
        return [...current, block];
      }
      return current.map((b, i): TimelineBlock => {
        if (i !== idx || b.type !== 'thinking') return b;
        return { ...b, text: b.text + event.text };
      });
    }

    case 'thinking_done': {
      const idx = findLastIndex(
        current,
        (b): b is ThinkingTimelineBlock =>
          b.type === 'thinking' && b.blockIndex === event.blockIndex,
      );
      if (idx === -1) return current;
      return current.map((b, i): TimelineBlock => {
        if (i !== idx || b.type !== 'thinking') return b;
        const next: ThinkingTimelineBlock = {
          ...b,
          status: 'done',
          signature: event.signature,
        };
        if (event.summaryMode && event.evaluationItems) {
          next.summaryMode = true;
          next.evaluationItems = event.evaluationItems;
        }
        return next;
      });
    }

    case 'text_delta': {
      const last = current[current.length - 1];
      if (last && last.type === 'text' && last.status === 'streaming') {
        return current.map((b, i): TimelineBlock => {
          if (i !== current.length - 1 || b.type !== 'text') return b;
          return { ...b, text: b.text + event.text };
        });
      }
      const block: TextTimelineBlock = {
        type: 'text',
        text: event.text,
        status: 'streaming',
      };
      return [...current, block];
    }

    case 'tool_start': {
      const block: ToolTimelineBlock = {
        type: 'tool',
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        input: event.input,
        status: 'running',
        startedAt: now,
      };
      // [SPEC 7 P2.5b Layer 5] Inject `contact-resolved` row BEFORE the
      // tool block when the input carries a contact-name reference.
      // Today no auto-tier read takes a recipient field, so this branch
      // is dormant — kept for forward-compat with future tools and to
      // mirror the `pending_action` injection path so behavior stays
      // consistent across permission tiers.
      const resolved = detectResolvedContact(event.input, options?.contacts);
      if (resolved) {
        const contactBlock: ContactResolvedTimelineBlock = {
          type: 'contact-resolved',
          contactName: resolved.name,
          contactAddress: resolved.address,
          toolUseId: event.toolUseId,
        };
        return [...current, contactBlock, block];
      }
      return [...current, block];
    }

    case 'tool_result': {
      // [SPEC 8 v0.5.2 hotfix · Bug A] When the engine's
      // EarlyToolDispatcher serves a duplicate read from cache it emits
      // tool_start (creates the timeline block) THEN tool_result with
      // resultDeduped=true. The legacy `tools[]` array is filtered in
      // useEngine.processSSEChunk, but `applyEventToTimeline` runs at
      // the bottom of the same reducer regardless of break — so without
      // this branch the duplicate stays as a 'done' tool block and v2
      // renders TWO identical balance/swap-quote/etc cards. Mirror the
      // legacy suppression by filtering the matching tool block out of
      // the timeline entirely.
      if (event.resultDeduped) {
        // Sweep both the tool block AND any contact-resolved row
        // attached to the same toolUseId — keeps dedup symmetric for
        // P2.5b's synthetic rows.
        return current.filter(
          (b) =>
            !(b.type === 'tool' && b.toolUseId === event.toolUseId) &&
            !(b.type === 'contact-resolved' && b.toolUseId === event.toolUseId),
        );
      }
      const idx = findLastIndex(
        current,
        (b): b is ToolTimelineBlock =>
          b.type === 'tool' && b.toolUseId === event.toolUseId,
      );
      if (idx === -1) return current;
      return current.map((b, i): TimelineBlock => {
        if (i !== idx || b.type !== 'tool') return b;
        const next: ToolTimelineBlock = {
          ...b,
          status: event.isError ? 'error' : 'done',
          result: event.result,
          isError: event.isError,
          endedAt: now,
        };
        // [SPEC 8 v0.5.1 B3.2] HTTP retry surface — only set when > 1
        // (engine omits the field on first-try success). `ToolBlockView`
        // renders "TOOL · attempt N · 1.4s" subtitle when present.
        if (event.attemptCount !== undefined) {
          next.attemptCount = event.attemptCount;
        }
        return next;
      });
    }

    case 'tool_progress': {
      const idx = findLastIndex(
        current,
        (b): b is ToolTimelineBlock =>
          b.type === 'tool' && b.toolUseId === event.toolUseId,
      );
      if (idx === -1) return current;
      return current.map((b, i): TimelineBlock => {
        if (i !== idx || b.type !== 'tool') return b;
        return {
          ...b,
          progress: { message: event.message, pct: event.pct },
        };
      });
    }

    case 'todo_update': {
      const idx = current.findIndex(
        (b): b is TodoTimelineBlock => b.type === 'todo',
      );
      if (idx === -1) {
        const block: TodoTimelineBlock = {
          type: 'todo',
          toolUseId: event.toolUseId,
          items: event.items,
          lastUpdatedAt: now,
        };
        return [...current, block];
      }
      return current.map((b, i): TimelineBlock => {
        if (i !== idx || b.type !== 'todo') return b;
        return { ...b, items: event.items, lastUpdatedAt: now };
      });
    }

    case 'canvas':
      return [
        ...current,
        {
          type: 'canvas',
          toolUseId: event.toolUseId,
          template: event.template,
          title: event.title,
          data: event.data,
        },
      ];

    case 'pending_action': {
      // [SPEC 8 v0.5.2 hotfix · Bug F] When the engine yields
      // pending_action, the LLM has stopped streaming for THIS batch —
      // the turn pauses until the user approves/denies. Any in-flight
      // text/thinking blocks (e.g. "Executing swap now.") must
      // transition out of `streaming` or the renderer will keep showing
      // the DELIVERING indicator + "Audric is typing" hint forever.
      // Mirror the turn_complete finalization so the chat reads "Quote
      // → permission card → receipt → narration" cleanly.
      let changed = false;
      const finalized = current.map((b): TimelineBlock => {
        if ((b.type === 'thinking' || b.type === 'text') && b.status === 'streaming') {
          changed = true;
          return { ...b, status: 'done' };
        }
        return b;
      });
      const base = changed ? finalized : current;

      // [SPEC 7 P2.5b Layer 5] Pre-bundle planning surface synthetic rows.
      const action = event.action as PendingAction;
      const isBundle = Array.isArray(action.steps) && action.steps.length >= 2;
      const synthetic: TimelineBlock[] = [];

      if (isBundle) {
        // Per-step contact resolution (each leg may reference a
        // different contact — "send $50 to Mom and $50 to Sarah" is
        // a real bundle shape). Dedup on (name → address) so a single
        // contact mentioned across multiple legs surfaces once.
        const seen = new Set<string>();
        for (const step of action.steps ?? []) {
          const resolved = detectResolvedContact(step.input, options?.contacts);
          if (!resolved) continue;
          const key = `${resolved.name.toLowerCase()}::${resolved.address}`;
          if (seen.has(key)) continue;
          seen.add(key);
          synthetic.push({
            type: 'contact-resolved',
            contactName: resolved.name,
            contactAddress: resolved.address,
            toolUseId: step.toolUseId,
          });
        }
        // PLAN STREAM is the FINAL synthetic row before the card —
        // declares the agent has compiled the plan into one atomic PTB.
        synthetic.push({
          type: 'plan-stream',
          stepCount: action.steps?.length ?? 0,
          attemptId: action.attemptId,
        });
      } else {
        // Single-write confirms still get the contact row when relevant
        // (e.g. "send $5 to Mom" is the single-write path that benefits
        // from this UX too — the contact resolution is the same intent
        // signal as in a bundle).
        const resolved = detectResolvedContact(action.input, options?.contacts);
        if (resolved) {
          synthetic.push({
            type: 'contact-resolved',
            contactName: resolved.name,
            contactAddress: resolved.address,
            toolUseId: action.toolUseId,
          });
        }
      }

      return [
        ...base,
        ...synthetic,
        {
          type: 'permission-card',
          payload: action,
          status: 'pending',
        },
      ];
    }

    case 'pending_input':
      return [
        ...current,
        {
          type: 'pending-input',
          inputId: event.inputId,
          schema: event.schema,
          prompt: event.prompt,
        },
      ];

    case 'turn_complete': {
      let changed = false;
      const next = current.map((b): TimelineBlock => {
        if (b.type === 'thinking' && b.status === 'streaming') {
          changed = true;
          return { ...b, status: 'done' };
        }
        if (b.type === 'text' && b.status === 'streaming') {
          changed = true;
          return { ...b, status: 'done' };
        }
        if (b.type === 'tool' && b.status === 'running') {
          changed = true;
          return { ...b, status: 'done', endedAt: now };
        }
        return b;
      });
      return changed ? next : current;
    }

    // [SPEC 8 v0.5.1 B3.2] `harness_shape` is a turn-level metadata
    // event; it produces no timeline block of its own. The host stashes
    // the shape on `EngineChatMessage.harnessShape` (handled in
    // useEngine.processSSEChunk), and the timeline stays unchanged.
    case 'harness_shape':
    case 'usage':
    case 'error':
      return current;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.1 — Permission-card lifecycle transition (audit Gap B)
//
// `applyEventToTimeline` only reacts to engine SSE events, so it never sees
// the user-confirm round-trip — that lives in `useEngine.resolveAction`.
// Without this helper, `permission-card` blocks created on `pending_action`
// would be stuck at `status: 'pending'` forever; on scroll-back the user
// would see an "active" approve/deny card for an action that already
// resolved 5 minutes ago.
//
// The helper is a pure function (testable) that takes the timeline + a
// toolUseId + a target status and returns a new timeline with the matching
// permission-card transitioned. No-op (returns same reference) when:
//   - timeline is undefined / empty
//   - no permission-card with that toolUseId exists
//   - the matching block is already at the target status
//
// `PermissionCardBlockView` reads `block.status` and renders nothing once
// status leaves 'pending' — same UX as today's legacy path where the card
// disappears when `message.pendingAction` clears.
// ───────────────────────────────────────────────────────────────────────────

export type PermissionCardResolution = Exclude<
  PermissionCardTimelineBlock['status'],
  'pending'
>;

export function markPermissionCardResolved(
  timeline: TimelineBlock[] | undefined,
  toolUseId: string,
  status: PermissionCardResolution,
): TimelineBlock[] {
  const current = timeline ?? [];

  const idx = current.findIndex(
    (b): b is PermissionCardTimelineBlock =>
      b.type === 'permission-card' && b.payload.toolUseId === toolUseId,
  );
  if (idx === -1) return current;
  if ((current[idx] as PermissionCardTimelineBlock).status === status) return current;

  return current.map((b, i): TimelineBlock => {
    if (i !== idx || b.type !== 'permission-card') return b;
    return { ...b, status };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.2 hotfix · Bug B — Receipt card after writes
//
// The engine yields `pending_action` for confirm-tier write tools (no
// `tool_start` event). After the user approves and the client-side
// sponsored-tx flow returns `{ tx: digest, balanceChanges, ... }`, the
// engine DOES NOT emit a `tool_result` event back to the host — it
// injects the result into the LLM message history server-side and
// resumes streaming the narration. So under v2, the timeline never
// gets a `tool` block carrying the digest, and `<TransactionReceiptCard>`
// (which keys off `result.data.tx`) never renders.
//
// This helper fills the gap by synthesizing a `done` tool block from
// the `executionResult` that `resolveAction` already has in hand.
// Behavior:
//   - When a tool block with that `toolUseId` already exists (rare for
//     confirm tier; common for auto tier in future), update it in place.
//   - Otherwise, append a new `done` tool block with `result =
//     executionResult` and a `permission-card`-relative position
//     (after the resolved card, before whatever the resume turn
//     renders next).
//   - When no permission card exists either (denied path / synthesized
//     pre-execute failure), still append — keeps the timeline a
//     single-source-of-truth render even on edge paths.
//
// Idempotent: calling with the same `toolUseId` twice returns the same
// reference on the second call (state already reflects executionResult).
// ───────────────────────────────────────────────────────────────────────────

export function mergeWriteExecutionIntoTimeline(
  timeline: TimelineBlock[] | undefined,
  toolUseId: string,
  toolName: string,
  input: unknown,
  executionResult: unknown,
  now: number,
): TimelineBlock[] {
  const current = timeline ?? [];

  const existingIdx = current.findIndex(
    (b): b is ToolTimelineBlock =>
      b.type === 'tool' && b.toolUseId === toolUseId,
  );

  if (existingIdx !== -1) {
    const existing = current[existingIdx] as ToolTimelineBlock;
    if (existing.status === 'done' && existing.result === executionResult) {
      return current;
    }
    return current.map((b, i): TimelineBlock => {
      if (i !== existingIdx || b.type !== 'tool') return b;
      return {
        ...b,
        status: 'done',
        result: executionResult,
        isError: false,
        endedAt: now,
      };
    });
  }

  // Insert AFTER the resolved permission card if one exists, so the
  // chronological reading is "user approved → tx ran → here's the
  // receipt". Falls back to plain append when there's no card.
  const cardIdx = current.findIndex(
    (b): b is PermissionCardTimelineBlock =>
      b.type === 'permission-card' && b.payload.toolUseId === toolUseId,
  );

  const synthesized: ToolTimelineBlock = {
    type: 'tool',
    toolUseId,
    toolName,
    input,
    status: 'done',
    startedAt: now,
    endedAt: now,
    result: executionResult,
    isError: false,
  };

  if (cardIdx === -1) return [...current, synthesized];

  const next = current.slice();
  next.splice(cardIdx + 1, 0, synthesized);
  return next;
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — Mark in-flight blocks as interrupted (audit Gap J)
//
// Called when:
//   - The SSE stream closes WITHOUT a `turn_complete` event (network drop,
//     server abort, AuthError mid-stream).
//   - A persisted session is rehydrated and the server-side timeline ended
//     with `streaming` / `running` blocks (page reload after a tab close).
//
// Walks the timeline and flips:
//   - `text` / `thinking` blocks at status `streaming` → `interrupted`
//   - `tool` blocks at status `running` → `interrupted` (also stamps `endedAt`
//     so the renderer can compute "it ran for N seconds before the cut")
//   - All other statuses are left alone — `done` / `error` blocks are
//     terminal and re-marking them would lose information.
//
// Idempotent: returns the same reference when no in-flight blocks remain.
// `<RetryInterruptedTurn>` keys off the presence of any `interrupted`
// block (or the message's `interrupted` flag — set by the caller next to
// this helper).
// ───────────────────────────────────────────────────────────────────────────

export function markTimelineInterrupted(
  timeline: TimelineBlock[] | undefined,
  now: number,
): TimelineBlock[] {
  const current = timeline ?? [];
  if (current.length === 0) return current;

  let changed = false;
  const next = current.map((b): TimelineBlock => {
    if ((b.type === 'text' || b.type === 'thinking') && b.status === 'streaming') {
      changed = true;
      return { ...b, status: 'interrupted' };
    }
    if (b.type === 'tool' && b.status === 'running') {
      changed = true;
      return { ...b, status: 'interrupted', endedAt: now };
    }
    return b;
  });
  return changed ? next : current;
}

/**
 * Local `findLastIndex` helper. Native Array.findLastIndex exists in
 * ES2023 and is available in modern Node/browsers, but using it directly
 * triggers `lib` warnings depending on tsconfig target. This shim keeps
 * us compatible regardless.
 */
function findLastIndex<T, S extends T>(
  arr: ReadonlyArray<T>,
  predicate: (value: T, index: number) => value is S,
): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) return i;
  }
  return -1;
}
