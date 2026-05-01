// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B2.3 — applyEventToTimeline unit tests
//
// Covers all 14 SSE event types + key invariants that React relies on
// (purity, no mutation, terminal-state transitions on turn_complete).
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { applyEventToTimeline, markPermissionCardResolved } from '@/lib/timeline-builder';
import type {
  SSEEvent,
  TimelineBlock,
  ThinkingTimelineBlock,
  TextTimelineBlock,
  ToolTimelineBlock,
  TodoTimelineBlock,
  PendingAction,
} from '@/lib/engine-types';

const T0 = 1_700_000_000_000;

/** Apply a sequence of events starting from `seed`, returning the final timeline. */
function applyAll(
  events: SSEEvent[],
  seed: TimelineBlock[] = [],
  startNow = T0,
): TimelineBlock[] {
  return events.reduce<TimelineBlock[]>(
    (tl, ev, i) => applyEventToTimeline(tl, ev, startNow + i),
    seed,
  );
}

describe('applyEventToTimeline — thinking', () => {
  it('creates a new thinking block on first delta', () => {
    const tl = applyAll([
      { type: 'thinking_delta', text: 'Hello', blockIndex: 0 },
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({
      type: 'thinking',
      blockIndex: 0,
      text: 'Hello',
      status: 'streaming',
    });
  });

  it('appends deltas onto the existing block (same blockIndex)', () => {
    const tl = applyAll([
      { type: 'thinking_delta', text: 'Hel', blockIndex: 0 },
      { type: 'thinking_delta', text: 'lo ', blockIndex: 0 },
      { type: 'thinking_delta', text: 'world', blockIndex: 0 },
    ]);
    expect(tl).toHaveLength(1);
    expect((tl[0] as ThinkingTimelineBlock).text).toBe('Hello world');
  });

  it('creates a SECOND thinking block for a new blockIndex (multi-burst thinking)', () => {
    const tl = applyAll([
      { type: 'thinking_delta', text: 'first burst', blockIndex: 0 },
      { type: 'thinking_done', blockIndex: 0 },
      { type: 'thinking_delta', text: 'second burst', blockIndex: 2 },
    ]);
    expect(tl).toHaveLength(2);
    expect((tl[0] as ThinkingTimelineBlock).blockIndex).toBe(0);
    expect((tl[0] as ThinkingTimelineBlock).status).toBe('done');
    expect((tl[1] as ThinkingTimelineBlock).blockIndex).toBe(2);
    expect((tl[1] as ThinkingTimelineBlock).status).toBe('streaming');
  });

  it('marks the matching block done on thinking_done', () => {
    const tl = applyAll([
      { type: 'thinking_delta', text: 'x', blockIndex: 0 },
      { type: 'thinking_done', blockIndex: 0, signature: 'sig123' },
    ]);
    expect((tl[0] as ThinkingTimelineBlock).status).toBe('done');
    expect((tl[0] as ThinkingTimelineBlock).signature).toBe('sig123');
  });

  it('attaches summaryMode + evaluationItems on thinking_done when present', () => {
    const tl = applyAll([
      { type: 'thinking_delta', text: '<eval_summary>...', blockIndex: 0 },
      {
        type: 'thinking_done',
        blockIndex: 0,
        summaryMode: true,
        evaluationItems: [
          { label: 'Has enough USDC', status: 'good' },
          { label: 'HF safe', status: 'good', note: 'HF=2.4' },
        ],
      },
    ]);
    const b = tl[0] as ThinkingTimelineBlock;
    expect(b.summaryMode).toBe(true);
    expect(b.evaluationItems).toHaveLength(2);
    expect(b.evaluationItems?.[1]).toMatchObject({ label: 'HF safe', note: 'HF=2.4' });
  });

  it('thinking_done with no matching block leaves timeline unchanged', () => {
    const seed: TimelineBlock[] = [];
    const tl = applyEventToTimeline(seed, { type: 'thinking_done', blockIndex: 7 }, T0);
    expect(tl).toBe(seed);
  });
});

describe('applyEventToTimeline — text', () => {
  it('creates a streaming text block on first delta', () => {
    const tl = applyAll([{ type: 'text_delta', text: 'Hi' }]);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({ type: 'text', text: 'Hi', status: 'streaming' });
  });

  it('appends to the open streaming text block', () => {
    const tl = applyAll([
      { type: 'text_delta', text: 'Hi ' },
      { type: 'text_delta', text: 'there' },
    ]);
    expect(tl).toHaveLength(1);
    expect((tl[0] as TextTimelineBlock).text).toBe('Hi there');
  });

  it('starts a NEW text block when a different block was last (e.g. tool ran in between)', () => {
    const tl = applyAll([
      { type: 'text_delta', text: 'pre-tool' },
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      { type: 'text_delta', text: 'post-tool' },
    ]);
    expect(tl).toHaveLength(3);
    expect((tl[0] as TextTimelineBlock).text).toBe('pre-tool');
    expect(tl[1].type).toBe('tool');
    expect((tl[2] as TextTimelineBlock).text).toBe('post-tool');
  });
});

describe('applyEventToTimeline — tools', () => {
  it('creates a running tool block on tool_start', () => {
    const tl = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: { wallet: '0x1' } },
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({
      type: 'tool',
      toolUseId: 't1',
      toolName: 'balance_check',
      status: 'running',
      startedAt: T0,
    });
  });

  it('marks the tool done on tool_result (success)', () => {
    const tl = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't1',
        result: { ok: 1 },
        isError: false,
      },
    ]);
    const b = tl[0] as ToolTimelineBlock;
    expect(b.status).toBe('done');
    expect(b.result).toEqual({ ok: 1 });
    expect(b.isError).toBe(false);
    expect(b.endedAt).toBe(T0 + 1);
  });

  it('marks the tool errored on tool_result with isError=true', () => {
    const tl = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't1',
        result: 'boom',
        isError: true,
      },
    ]);
    expect((tl[0] as ToolTimelineBlock).status).toBe('error');
    expect((tl[0] as ToolTimelineBlock).isError).toBe(true);
  });

  it('attaches progress to the matching running tool block', () => {
    const tl = applyAll([
      { type: 'tool_start', toolName: 'swap_execute', toolUseId: 't1', input: {} },
      { type: 'tool_progress', toolName: 'swap_execute', toolUseId: 't1', message: 'routing', pct: 30 },
    ]);
    const b = tl[0] as ToolTimelineBlock;
    expect(b.progress).toEqual({ message: 'routing', pct: 30 });
    expect(b.status).toBe('running');
  });

  it('latest progress wins (overwrites prior message)', () => {
    const tl = applyAll([
      { type: 'tool_start', toolName: 'swap_execute', toolUseId: 't1', input: {} },
      { type: 'tool_progress', toolName: 'swap_execute', toolUseId: 't1', message: 'routing', pct: 30 },
      { type: 'tool_progress', toolName: 'swap_execute', toolUseId: 't1', message: 'building tx', pct: 70 },
    ]);
    expect((tl[0] as ToolTimelineBlock).progress).toEqual({ message: 'building tx', pct: 70 });
  });

  it('attaches attemptCount on tool_result when the engine reports retries (>1)', () => {
    const tl = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't1',
        result: { ok: 1 },
        isError: false,
        attemptCount: 3,
      },
    ]);
    const b = tl[0] as ToolTimelineBlock;
    expect(b.attemptCount).toBe(3);
    expect(b.status).toBe('done');
  });

  it('omits attemptCount on tool_result when the engine does not report it (1st-try success)', () => {
    const tl = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't1',
        result: { ok: 1 },
        isError: false,
      },
    ]);
    const b = tl[0] as ToolTimelineBlock;
    expect(b.attemptCount).toBeUndefined();
  });

  it('harness_shape is a no-op for the timeline (metadata lives on the message)', () => {
    const seed = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
    ]);
    const next = applyEventToTimeline(
      seed,
      { type: 'harness_shape', shape: 'rich', rationale: 'classifyEffort=high' },
      T0 + 100,
    );
    expect(next).toBe(seed);
  });

  it('tool_result for an unknown toolUseId is a no-op', () => {
    const seed = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
    ]);
    const next = applyEventToTimeline(
      seed,
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 'OTHER',
        result: 'x',
        isError: false,
      },
      T0 + 999,
    );
    expect(next).toBe(seed);
  });
});

describe('applyEventToTimeline — todo (sticky singleton)', () => {
  it('creates the todo block on first todo_update', () => {
    const tl = applyAll([
      {
        type: 'todo_update',
        toolUseId: 'todo-1',
        items: [
          { id: '1', label: 'check balances', status: 'in_progress' },
          { id: '2', label: 'plan swap', status: 'pending' },
        ],
      },
    ]);
    expect(tl).toHaveLength(1);
    expect((tl[0] as TodoTimelineBlock).items).toHaveLength(2);
    expect((tl[0] as TodoTimelineBlock).lastUpdatedAt).toBe(T0);
  });

  it('upserts subsequent todo_updates into the same singleton (no duplicates)', () => {
    const tl = applyAll([
      {
        type: 'todo_update',
        toolUseId: 'todo-1',
        items: [{ id: '1', label: 'a', status: 'in_progress' }],
      },
      {
        type: 'todo_update',
        toolUseId: 'todo-2',
        items: [{ id: '1', label: 'a', status: 'completed' }],
      },
    ]);
    expect(tl).toHaveLength(1);
    const b = tl[0] as TodoTimelineBlock;
    expect(b.items[0].status).toBe('completed');
    expect(b.toolUseId).toBe('todo-1'); // first toolUseId is preserved as the React key
    expect(b.lastUpdatedAt).toBe(T0 + 1);
  });
});

describe('applyEventToTimeline — slot blocks (canvas, permission-card, pending-input)', () => {
  it('appends a canvas block', () => {
    const tl = applyAll([
      {
        type: 'canvas',
        toolUseId: 'cv1',
        template: 'health',
        title: 'Health',
        data: { hf: 2.1 },
      },
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({ type: 'canvas', toolUseId: 'cv1', title: 'Health' });
  });

  it('appends a permission-card block (status: pending)', () => {
    const tl = applyAll([
      {
        type: 'pending_action',
        // Minimal viable PendingAction shape; the renderer is the only consumer
        // and it only reads payload.type at the timeline layer.
        action: { id: 'pa1', toolName: 'send_transfer', input: { to: '0x1' } } as never,
      },
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0].type).toBe('permission-card');
    expect((tl[0] as { status: string }).status).toBe('pending');
  });

  it('appends a pending-input block (SPEC 9 reservation)', () => {
    const tl = applyAll([
      {
        type: 'pending_input',
        inputId: 'in1',
        schema: { kind: 'address' },
        prompt: 'recipient?',
      },
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({
      type: 'pending-input',
      inputId: 'in1',
      prompt: 'recipient?',
    });
  });
});

describe('applyEventToTimeline — turn_complete', () => {
  it('flips streaming thinking + text and running tools to done', () => {
    const tl = applyAll([
      { type: 'thinking_delta', text: 't', blockIndex: 0 },
      { type: 'text_delta', text: 'hi' },
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      { type: 'turn_complete', stopReason: 'end_turn' },
    ]);
    expect((tl[0] as ThinkingTimelineBlock).status).toBe('done');
    expect((tl[1] as TextTimelineBlock).status).toBe('done');
    const tool = tl[2] as ToolTimelineBlock;
    expect(tool.status).toBe('done');
    expect(tool.endedAt).toBe(T0 + 3);
  });

  it('returns the SAME reference when nothing was streaming/running (React-friendly no-op)', () => {
    const seed = applyAll([
      { type: 'tool_start', toolName: 'x', toolUseId: 't1', input: {} },
      { type: 'tool_result', toolName: 'x', toolUseId: 't1', result: null, isError: false },
    ]);
    const next = applyEventToTimeline(seed, { type: 'turn_complete', stopReason: 'end_turn' }, T0 + 99);
    expect(next).toBe(seed);
  });
});

describe('applyEventToTimeline — passthroughs (usage, error)', () => {
  it('usage events leave the timeline reference unchanged', () => {
    const seed = applyAll([{ type: 'text_delta', text: 'x' }]);
    const next = applyEventToTimeline(
      seed,
      { type: 'usage', inputTokens: 10, outputTokens: 5 },
      T0,
    );
    expect(next).toBe(seed);
  });

  it('error events leave the timeline reference unchanged', () => {
    const seed = applyAll([{ type: 'text_delta', text: 'x' }]);
    const next = applyEventToTimeline(seed, { type: 'error', message: 'boom' }, T0);
    expect(next).toBe(seed);
  });
});

describe('applyEventToTimeline — purity invariants', () => {
  it('does not mutate the input timeline', () => {
    const seed: TimelineBlock[] = [
      { type: 'thinking', blockIndex: 0, text: 'a', status: 'streaming' },
    ];
    const snapshot = JSON.stringify(seed);
    applyEventToTimeline(seed, { type: 'thinking_delta', text: 'b', blockIndex: 0 }, T0);
    expect(JSON.stringify(seed)).toBe(snapshot);
  });

  it('returns a new array reference for any mutation event', () => {
    const seed: TimelineBlock[] = [];
    const next = applyEventToTimeline(seed, { type: 'text_delta', text: 'hi' }, T0);
    expect(next).not.toBe(seed);
  });

  it('treats undefined timeline same as []', () => {
    const next = applyEventToTimeline(undefined, { type: 'text_delta', text: 'hi' }, T0);
    expect(next).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.1 — markPermissionCardResolved (audit Gap B)
//
// Closes the user-confirm round-trip in the timeline. Without this helper
// the permission-card block stays at status: 'pending' forever even after
// the user approved/denied, leaving an orphaned "active" card on scroll-back.
// ───────────────────────────────────────────────────────────────────────────

function fakeAction(toolUseId: string, toolName = 'send_transfer'): PendingAction {
  return {
    toolName,
    toolUseId,
    input: { amount: 10 },
    description: `${toolName} test`,
    assistantContent: [],
    turnIndex: 0,
    attemptId: `attempt-${toolUseId}`,
  };
}

describe('markPermissionCardResolved', () => {
  it('transitions a matching pending permission-card to approved', () => {
    const seed: TimelineBlock[] = [
      { type: 'text', text: 'hi', status: 'done' },
      { type: 'permission-card', payload: fakeAction('t1'), status: 'pending' },
    ];
    const next = markPermissionCardResolved(seed, 't1', 'approved');
    expect(next).not.toBe(seed);
    expect(next[1]).toMatchObject({ type: 'permission-card', status: 'approved' });
    expect(next[0]).toBe(seed[0]);
  });

  it('transitions to denied without mutating other blocks', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: fakeAction('t1'), status: 'pending' },
      { type: 'text', text: 'tail', status: 'streaming' },
    ];
    const snapshot = JSON.stringify(seed);
    const next = markPermissionCardResolved(seed, 't1', 'denied');
    expect(next[0]).toMatchObject({ type: 'permission-card', status: 'denied' });
    expect(next[1]).toBe(seed[1]);
    expect(JSON.stringify(seed)).toBe(snapshot);
  });

  it('returns same reference when no permission-card matches the toolUseId', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: fakeAction('t1'), status: 'pending' },
    ];
    const next = markPermissionCardResolved(seed, 'unknown', 'approved');
    expect(next).toBe(seed);
  });

  it('returns same reference when the matching block is already at the target status', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: fakeAction('t1'), status: 'approved' },
    ];
    const next = markPermissionCardResolved(seed, 't1', 'approved');
    expect(next).toBe(seed);
  });

  it('treats undefined timeline same as []', () => {
    const next = markPermissionCardResolved(undefined, 't1', 'approved');
    expect(next).toEqual([]);
  });

  it('only flips the first match when toolUseId is unique (typical case)', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: fakeAction('t1'), status: 'pending' },
      { type: 'tool', toolUseId: 't2', toolName: 'x', input: {}, status: 'done', startedAt: T0, result: null, isError: false },
      { type: 'permission-card', payload: fakeAction('t3'), status: 'pending' },
    ];
    const next = markPermissionCardResolved(seed, 't3', 'approved');
    expect(next[0]).toMatchObject({ type: 'permission-card', status: 'pending' });
    expect(next[1]).toBe(seed[1]);
    expect(next[2]).toMatchObject({ type: 'permission-card', status: 'approved' });
  });
});
