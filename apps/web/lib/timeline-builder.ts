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
} from '@/lib/engine-types';

/**
 * Apply one SSE event to a timeline and return the updated timeline.
 * The original `timeline` reference is returned unchanged when the
 * event has no timeline impact — lets React skip re-renders.
 */
export function applyEventToTimeline(
  timeline: TimelineBlock[] | undefined,
  event: SSEEvent,
  now: number,
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
      return [...current, block];
    }

    case 'tool_result': {
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
          status: event.isError ? 'error' : 'done',
          result: event.result,
          isError: event.isError,
          endedAt: now,
        };
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

    case 'pending_action':
      return [
        ...current,
        {
          type: 'permission-card',
          payload: event.action,
          status: 'pending',
        },
      ];

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
