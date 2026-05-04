// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B2.3 — applyEventToTimeline unit tests
//
// Covers all 14 SSE event types + key invariants that React relies on
// (purity, no mutation, terminal-state transitions on turn_complete).
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  applyEventToTimeline,
  detectResolvedContact,
  markPermissionCardResolved,
  markTimelineInterrupted,
  mergeWriteExecutionIntoTimeline,
  mergeBundleExecutionIntoTimeline,
} from '@/lib/timeline-builder';
import type {
  SSEEvent,
  TimelineBlock,
  ThinkingTimelineBlock,
  TextTimelineBlock,
  ToolTimelineBlock,
  TodoTimelineBlock,
  PendingAction,
  ContactResolvedTimelineBlock,
  PlanStreamTimelineBlock,
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

  it('removes the matching tool block when tool_result arrives with resultDeduped=true (Bug A regression)', () => {
    // [SPEC 8 v0.5.2 hotfix · Bug A] EarlyToolDispatcher emits a
    // tool_start for the dedup'd call, then tool_result with
    // resultDeduped=true. Without the suppression branch this would
    // leave a phantom 'done' tool block in the timeline, causing v2 to
    // render the same balance_check / swap_quote / etc card twice.
    const tl = applyAll([
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't2', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't1',
        result: { wallet: 100 },
        isError: false,
      },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't2',
        result: { wallet: 100 },
        isError: false,
        resultDeduped: true,
      },
    ]);
    expect(tl).toHaveLength(1);
    expect((tl[0] as ToolTimelineBlock).toolUseId).toBe('t1');
    expect((tl[0] as ToolTimelineBlock).status).toBe('done');
  });

  it('resultDeduped on an unknown toolUseId is a safe no-op', () => {
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
        resultDeduped: true,
      },
      T0 + 999,
    );
    expect(next).toHaveLength(1);
    expect((next[0] as ToolTimelineBlock).toolUseId).toBe('t1');
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

  it('finalizes in-flight streaming text + thinking blocks when pending_action arrives (Bug F regression)', () => {
    // [SPEC 8 v0.5.2 hotfix · Bug F] When the LLM yields pending_action,
    // streaming text/thinking blocks must transition to 'done' or the
    // renderer keeps showing the DELIVERING indicator + "Audric is
    // typing" hint forever (the screenshot bug).
    const tl = applyAll([
      { type: 'thinking_delta', text: 'pre-quote', blockIndex: 0 },
      { type: 'text_delta', text: 'Executing swap now.' },
      {
        type: 'pending_action',
        action: { id: 'pa1', toolName: 'swap_execute', input: {} } as never,
      },
    ]);
    expect(tl).toHaveLength(3);
    expect(tl[0]).toMatchObject({ type: 'thinking', status: 'done' });
    expect(tl[1]).toMatchObject({ type: 'text', text: 'Executing swap now.', status: 'done' });
    expect(tl[2]).toMatchObject({ type: 'permission-card', status: 'pending' });
  });

  it('leaves already-done blocks untouched when pending_action arrives', () => {
    const tl = applyAll([
      { type: 'thinking_delta', text: 'plan', blockIndex: 0 },
      { type: 'thinking_done', blockIndex: 0 },
      {
        type: 'pending_action',
        action: { id: 'pa1', toolName: 'swap_execute', input: {} } as never,
      },
    ]);
    expect(tl).toHaveLength(2);
    expect(tl[0]).toMatchObject({ type: 'thinking', status: 'done' });
    expect(tl[1]).toMatchObject({ type: 'permission-card', status: 'pending' });
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

  it('is idempotent for denied → denied (audit polish — symmetry with approved)', () => {
    // Mirrors the approved→approved case above. Without this regression
    // lock, a future refactor could accidentally drop the early-return
    // for one resolution branch but not the other, double-allocating
    // the timeline array on every re-resolve attempt for that branch.
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: fakeAction('t1'), status: 'denied' },
    ];
    const next = markPermissionCardResolved(seed, 't1', 'denied');
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

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — markTimelineInterrupted (audit Gap J)
//
// Flips in-flight blocks (text/thinking 'streaming', tool 'running') to
// 'interrupted' so the renderer can dim the partial output and the
// retry-pill becomes visible. Terminal-state blocks (done / error) are
// untouched.
// ───────────────────────────────────────────────────────────────────────────

describe('markTimelineInterrupted', () => {
  it('flips streaming text blocks to interrupted', () => {
    const seed: TimelineBlock[] = [
      { type: 'text', text: 'partial', status: 'streaming' },
    ];
    const next = markTimelineInterrupted(seed, T0);
    expect(next).not.toBe(seed);
    expect(next[0]).toMatchObject({ type: 'text', status: 'interrupted', text: 'partial' });
  });

  it('flips streaming thinking blocks to interrupted', () => {
    const seed: TimelineBlock[] = [
      { type: 'thinking', blockIndex: 0, text: 't', status: 'streaming' },
    ];
    const next = markTimelineInterrupted(seed, T0);
    expect(next[0]).toMatchObject({ type: 'thinking', status: 'interrupted' });
  });

  it('flips running tool blocks to interrupted and stamps endedAt', () => {
    const seed: TimelineBlock[] = [
      { type: 'tool', toolUseId: 't1', toolName: 'x', input: {}, status: 'running', startedAt: T0 - 5000 },
    ];
    const next = markTimelineInterrupted(seed, T0);
    expect(next[0]).toMatchObject({
      type: 'tool',
      status: 'interrupted',
      startedAt: T0 - 5000,
      endedAt: T0,
    });
  });

  it('leaves done / error blocks untouched', () => {
    const seed: TimelineBlock[] = [
      { type: 'text', text: 'final', status: 'done' },
      { type: 'tool', toolUseId: 't1', toolName: 'x', input: {}, status: 'error', startedAt: T0, endedAt: T0 + 1, isError: true },
      { type: 'thinking', blockIndex: 0, text: 'thunk', status: 'done', signature: 'abc' },
    ];
    const next = markTimelineInterrupted(seed, T0 + 100);
    expect(next).toBe(seed);
  });

  it('returns same reference when no in-flight blocks remain', () => {
    const seed: TimelineBlock[] = [
      { type: 'text', text: 'x', status: 'done' },
    ];
    expect(markTimelineInterrupted(seed, T0)).toBe(seed);
  });

  it('treats undefined / empty timeline as no-op', () => {
    expect(markTimelineInterrupted(undefined, T0)).toEqual([]);
    const empty: TimelineBlock[] = [];
    expect(markTimelineInterrupted(empty, T0)).toBe(empty);
  });

  it('flips a mix of in-flight blocks in one pass', () => {
    const seed: TimelineBlock[] = [
      { type: 'text', text: 'final', status: 'done' },
      { type: 'thinking', blockIndex: 0, text: 'mid', status: 'streaming' },
      { type: 'tool', toolUseId: 't1', toolName: 'x', input: {}, status: 'running', startedAt: T0 - 200 },
      { type: 'text', text: 'partial', status: 'streaming' },
    ];
    const next = markTimelineInterrupted(seed, T0);
    expect(next[0]).toBe(seed[0]); // done text untouched (referentially)
    expect(next[1]).toMatchObject({ type: 'thinking', status: 'interrupted' });
    expect(next[2]).toMatchObject({ type: 'tool', status: 'interrupted', endedAt: T0 });
    expect(next[3]).toMatchObject({ type: 'text', status: 'interrupted' });
  });

  it('does not mutate the input timeline', () => {
    const seed: TimelineBlock[] = [
      { type: 'text', text: 'partial', status: 'streaming' },
    ];
    const snapshot = JSON.stringify(seed);
    markTimelineInterrupted(seed, T0);
    expect(JSON.stringify(seed)).toBe(snapshot);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.2 hotfix · Bug B — Receipt card after writes
// ───────────────────────────────────────────────────────────────────────────

describe('mergeWriteExecutionIntoTimeline', () => {
  const action: PendingAction = {
    toolUseId: 'wt1',
    toolName: 'save_deposit',
    input: { amount: 10, asset: 'USDC' },
    description: 'Save 10 USDC to NAVI at 5.64% APY',
    assistantContent: [],
    attemptId: 'att-1',
    turnIndex: 0,
  };
  const txDigest = '0xabc123';
  const executionResult = {
    data: {
      tx: txDigest,
      asset: 'USDC',
      amount: 10,
      balanceChanges: [],
    },
    success: true,
  };

  it('appends a synthesized done tool block when no tool block exists (confirm-tier write path)', () => {
    const seed: TimelineBlock[] = [
      {
        type: 'permission-card',
        payload: action,
        status: 'approved',
      },
    ];
    const next = mergeWriteExecutionIntoTimeline(
      seed,
      action.toolUseId,
      action.toolName,
      action.input,
      executionResult,
      T0,
    );
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({
      type: 'tool',
      toolUseId: 'wt1',
      toolName: 'save_deposit',
      status: 'done',
      result: executionResult,
      isError: false,
      startedAt: T0,
      endedAt: T0,
    });
  });

  it('inserts the synthesized tool block AFTER the resolved permission card', () => {
    const seed: TimelineBlock[] = [
      { type: 'thinking', blockIndex: 0, text: 'plan', status: 'done' },
      { type: 'permission-card', payload: action, status: 'approved' },
    ];
    const next = mergeWriteExecutionIntoTimeline(
      seed,
      action.toolUseId,
      action.toolName,
      action.input,
      executionResult,
      T0,
    );
    expect(next).toHaveLength(3);
    expect(next[0].type).toBe('thinking');
    expect(next[1].type).toBe('permission-card');
    expect(next[2].type).toBe('tool');
  });

  it('updates an existing tool block in place when one already exists (auto-tier path)', () => {
    const seed: TimelineBlock[] = [
      {
        type: 'tool',
        toolUseId: 'wt1',
        toolName: 'save_deposit',
        input: action.input,
        status: 'running',
        startedAt: T0 - 1000,
      },
    ];
    const next = mergeWriteExecutionIntoTimeline(
      seed,
      action.toolUseId,
      action.toolName,
      action.input,
      executionResult,
      T0,
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      type: 'tool',
      status: 'done',
      result: executionResult,
      isError: false,
      startedAt: T0 - 1000,
      endedAt: T0,
    });
  });

  it('appends when no permission card and no prior tool block exists (defensive)', () => {
    const seed: TimelineBlock[] = [
      { type: 'thinking', blockIndex: 0, text: 'orphan', status: 'done' },
    ];
    const next = mergeWriteExecutionIntoTimeline(
      seed,
      action.toolUseId,
      action.toolName,
      action.input,
      executionResult,
      T0,
    );
    expect(next).toHaveLength(2);
    expect(next[1].type).toBe('tool');
  });

  it('is idempotent — calling twice with same executionResult returns same reference on second call', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: action, status: 'approved' },
    ];
    const first = mergeWriteExecutionIntoTimeline(
      seed,
      action.toolUseId,
      action.toolName,
      action.input,
      executionResult,
      T0,
    );
    const second = mergeWriteExecutionIntoTimeline(
      first,
      action.toolUseId,
      action.toolName,
      action.input,
      executionResult,
      T0 + 100,
    );
    expect(second).toBe(first);
  });

  it('treats undefined timeline as empty array starting point', () => {
    const next = mergeWriteExecutionIntoTimeline(
      undefined,
      action.toolUseId,
      action.toolName,
      action.input,
      executionResult,
      T0,
    );
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe('tool');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.7 prep / Finding F6 — bundle receipt fold tests
// ───────────────────────────────────────────────────────────────────────────

describe('mergeBundleExecutionIntoTimeline (F6)', () => {
  const sharedDigest = 'HnqsoXiUx2PwaULudyqL2ZKxcK4DB2RzQGskoQjswjki';
  const bundleAction: PendingAction = {
    toolUseId: 'tc-1',
    toolName: 'swap_execute',
    input: { fromToken: 'USDC', toToken: 'SUI', amount: 5 },
    description: 'Swap 5 USDC for SUI (1% max slippage)',
    assistantContent: [],
    attemptId: 'bundle-att-1',
    turnIndex: 0,
    canRegenerate: true,
    regenerateInput: { toolUseIds: ['rd-1'] },
    quoteAge: 9000,
    steps: [
      {
        toolName: 'swap_execute',
        toolUseId: 'tc-1',
        attemptId: 'bundle-att-1',
        input: { fromToken: 'USDC', toToken: 'SUI', amount: 5 },
        description: 'Swap 5 USDC for SUI (1% max slippage)',
      },
      {
        toolName: 'save_deposit',
        toolUseId: 'tc-2',
        attemptId: 'bundle-att-2',
        input: { amount: 20, asset: 'USDC' },
        description: 'Save 20 USDC into NAVI at 4.72% APY',
      },
      {
        toolName: 'send_transfer',
        toolUseId: 'tc-3',
        attemptId: 'bundle-att-3',
        input: { amount: 1, asset: 'USDC', to: '0x40cd...' },
        description: 'Send 1 USDC to 0x40cd…3e62',
      },
    ],
  };

  const successfulStepResults = [
    { toolUseId: 'tc-1', result: { data: { tx: sharedDigest, success: true } }, isError: false },
    { toolUseId: 'tc-2', result: { data: { tx: sharedDigest, success: true } }, isError: false },
    { toolUseId: 'tc-3', result: { data: { tx: sharedDigest, success: true } }, isError: false },
  ];

  it('replaces N per-leg cards with ONE bundle-receipt block (the F6 headline regression)', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: bundleAction, status: 'approved' },
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      bundleAction,
      successfulStepResults,
      T0,
    );

    expect(next).toHaveLength(2);
    expect(next[0].type).toBe('permission-card');
    expect(next[1].type).toBe('bundle-receipt');

    const receipt = next[1] as Extract<TimelineBlock, { type: 'bundle-receipt' }>;
    expect(receipt.legs).toHaveLength(3);
    expect(receipt.txDigest).toBe(sharedDigest);
    expect(receipt.isError).toBe(false);
    expect(receipt.attemptId).toBe(bundleAction.attemptId);

    expect(receipt.legs.filter((l) => l.toolUseId === 'tc-1')).toHaveLength(1);
    const swapLeg = receipt.legs.find((l) => l.toolUseId === 'tc-1');
    expect(swapLeg?.description).toBe('Swap 5 USDC for SUI (1% max slippage)');
    expect(swapLeg?.toolName).toBe('swap_execute');
    expect(swapLeg?.isError).toBe(false);
  });

  it('inserts the bundle-receipt AFTER the resolved permission card (chronological reading)', () => {
    const seed: TimelineBlock[] = [
      { type: 'thinking', blockIndex: 0, text: 'evaluating', status: 'done' },
      { type: 'plan-stream', stepCount: 3, attemptId: bundleAction.attemptId },
      { type: 'permission-card', payload: bundleAction, status: 'approved' },
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      bundleAction,
      successfulStepResults,
      T0,
    );

    expect(next).toHaveLength(4);
    expect(next[0].type).toBe('thinking');
    expect(next[1].type).toBe('plan-stream');
    expect(next[2].type).toBe('permission-card');
    expect(next[3].type).toBe('bundle-receipt');
  });

  it('extracts shared txDigest from the first non-error leg (atomic Payment Intent → one digest for all)', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: bundleAction, status: 'approved' },
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      bundleAction,
      successfulStepResults,
      T0,
    );
    const receipt = next.find((b) => b.type === 'bundle-receipt') as
      | Extract<TimelineBlock, { type: 'bundle-receipt' }>
      | undefined;
    expect(receipt).toBeDefined();
    expect(receipt!.txDigest).toBe(sharedDigest);
  });

  it('handles `_bundleReverted` — every leg errored → isError=true, txDigest=undefined', () => {
    const revertedStepResults = bundleAction.steps!.map((step) => ({
      toolUseId: step.toolUseId,
      result: { error: 'Payment Intent reverted', _bundleReverted: true },
      isError: true,
    }));
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: bundleAction, status: 'approved' },
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      bundleAction,
      revertedStepResults,
      T0,
    );
    const receipt = next.find((b) => b.type === 'bundle-receipt') as
      | Extract<TimelineBlock, { type: 'bundle-receipt' }>
      | undefined;
    expect(receipt).toBeDefined();
    expect(receipt!.isError).toBe(true);
    expect(receipt!.txDigest).toBeUndefined();
    expect(receipt!.legs.every((l) => l.isError)).toBe(true);
  });

  it('falls through to plain append when no permission card exists (defensive)', () => {
    const seed: TimelineBlock[] = [
      { type: 'thinking', blockIndex: 0, text: 'orphan', status: 'done' },
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      bundleAction,
      successfulStepResults,
      T0,
    );
    expect(next).toHaveLength(2);
    expect(next[1].type).toBe('bundle-receipt');
  });

  it('is idempotent — calling twice with same attemptId returns the same reference', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: bundleAction, status: 'approved' },
    ];
    const first = mergeBundleExecutionIntoTimeline(seed, bundleAction, successfulStepResults, T0);
    const second = mergeBundleExecutionIntoTimeline(first, bundleAction, successfulStepResults, T0 + 100);
    expect(second).toBe(first);
  });

  it('refuses to fold for actions with steps.length < 2 (single-write path takes over)', () => {
    const singleStepAction: PendingAction = {
      ...bundleAction,
      steps: [bundleAction.steps![0]],
    };
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: singleStepAction, status: 'approved' },
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      singleStepAction,
      [successfulStepResults[0]],
      T0,
    );
    expect(next).toBe(seed);
    expect(next.find((b) => b.type === 'bundle-receipt')).toBeUndefined();
  });

  it('preserves leg order from action.steps (matches PermissionCard step ordering)', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: bundleAction, status: 'approved' },
    ];
    const reorderedStepResults = [
      successfulStepResults[2],
      successfulStepResults[0],
      successfulStepResults[1],
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      bundleAction,
      reorderedStepResults,
      T0,
    );
    const receipt = next.find((b) => b.type === 'bundle-receipt') as
      | Extract<TimelineBlock, { type: 'bundle-receipt' }>
      | undefined;
    expect(receipt).toBeDefined();
    expect(receipt!.legs.map((l) => l.toolUseId)).toEqual(['tc-1', 'tc-2', 'tc-3']);
  });

  it('marks legs without a matching stepResult as not-errored with undefined result (defensive)', () => {
    const seed: TimelineBlock[] = [
      { type: 'permission-card', payload: bundleAction, status: 'approved' },
    ];
    const next = mergeBundleExecutionIntoTimeline(
      seed,
      bundleAction,
      [successfulStepResults[0]],
      T0,
    );
    const receipt = next.find((b) => b.type === 'bundle-receipt') as
      | Extract<TimelineBlock, { type: 'bundle-receipt' }>
      | undefined;
    expect(receipt).toBeDefined();
    expect(receipt!.legs).toHaveLength(3);
    expect(receipt!.legs[0].result).toBeDefined();
    expect(receipt!.legs[1].result).toBeUndefined();
    expect(receipt!.legs[2].result).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.5b Layer 5 — synthetic pre-bundle planning rows
// ───────────────────────────────────────────────────────────────────────────

const CONTACTS_FIXTURE = [
  { name: 'Mom', address: '0x111111111111111111111111111111111111111111111111111111111111aaaa' },
  { name: 'Sarah', address: '0x222222222222222222222222222222222222222222222222222222222222bbbb' },
] as const;

describe('detectResolvedContact — pure helper', () => {
  it('matches a recipient field case-insensitively (input "mom" → contact "Mom")', () => {
    const out = detectResolvedContact({ to: 'mom', amount: 5 }, CONTACTS_FIXTURE, 'send_transfer');
    expect(out).toEqual({ name: 'Mom', address: CONTACTS_FIXTURE[0].address });
  });

  it('preserves the contact display name verbatim (NOT lowercased)', () => {
    const out = detectResolvedContact({ to: 'MOM' }, CONTACTS_FIXTURE, 'send_transfer');
    expect(out?.name).toBe('Mom'); // canonical from the contact list, not the user's input casing
  });

  it('skips already-resolved Sui addresses (0x… values are not contacts)', () => {
    const out = detectResolvedContact(
      { to: '0xabcdef0000000000000000000000000000000000000000000000000000000000' },
      CONTACTS_FIXTURE,
      'send_transfer',
    );
    expect(out).toBeNull();
  });

  it('only scans recipient-style fields (`to` / `recipient` / `address`)', () => {
    // `memo` and `note` should NOT be scanned (false-positive prevention —
    // "Hi Mom" in a memo isn't a recipient resolution).
    const out = detectResolvedContact(
      { to: '0xabcd000000000000000000000000000000000000000000000000000000000000', memo: 'Hi Mom' },
      CONTACTS_FIXTURE,
      'send_transfer',
    );
    expect(out).toBeNull();
  });

  it('matches the `recipient` and `address` fields too', () => {
    const a = detectResolvedContact({ recipient: 'sarah', amount: 1 }, CONTACTS_FIXTURE);
    expect(a).toEqual({ name: 'Sarah', address: CONTACTS_FIXTURE[1].address });
    const b = detectResolvedContact({ address: 'mom' }, CONTACTS_FIXTURE);
    expect(b).toEqual({ name: 'Mom', address: CONTACTS_FIXTURE[0].address });
  });

  it('returns null when contacts list is empty / undefined / no match', () => {
    expect(detectResolvedContact({ to: 'mom' }, [], 'send_transfer')).toBeNull();
    expect(detectResolvedContact({ to: 'mom' }, undefined, 'send_transfer')).toBeNull();
    expect(detectResolvedContact({ to: 'unknown-name' }, CONTACTS_FIXTURE, 'send_transfer')).toBeNull();
  });

  it('returns null for non-object inputs (defensive — engine inputs are objects but be safe)', () => {
    expect(detectResolvedContact(null, CONTACTS_FIXTURE, 'send_transfer')).toBeNull();
    expect(detectResolvedContact(undefined, CONTACTS_FIXTURE, 'send_transfer')).toBeNull();
    expect(detectResolvedContact('mom', CONTACTS_FIXTURE, 'send_transfer')).toBeNull();
    expect(detectResolvedContact(42, CONTACTS_FIXTURE, 'send_transfer')).toBeNull();
  });

  it('handles whitespace and empty strings (trims before compare; empty → null)', () => {
    expect(detectResolvedContact({ to: '   Mom   ' }, CONTACTS_FIXTURE, 'send_transfer')).toMatchObject({ name: 'Mom' });
    expect(detectResolvedContact({ to: '' }, CONTACTS_FIXTURE, 'send_transfer')).toBeNull();
    expect(detectResolvedContact({ to: '   ' }, CONTACTS_FIXTURE, 'send_transfer')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // P2.5b audit BUG #1 (MED) — toolName-aware `to` field gating.
  // The reducer used to scan `to` universally; `swap_execute.to` and
  // `swap_quote.to` carry the TARGET TOKEN symbol ("USDC", "SUI"), not a
  // recipient. A user with a contact whose name matched a token symbol
  // (e.g. "ETH", "BTC") would see a phantom CONTACT row injected into the
  // bundle's plan stream. These regressions lock the fix.
  // ─────────────────────────────────────────────────────────────────────────

  it('audit BUG #1: does NOT match contact-named-after-token on swap_execute.to (token symbol, not recipient)', () => {
    const tokenContacts = [
      { name: 'USDC', address: '0xfake1111111111111111111111111111111111111111111111111111111111aa' },
    ];
    const out = detectResolvedContact(
      { from: 'SUI', to: 'USDC', amount: 10 },
      tokenContacts,
      'swap_execute',
    );
    expect(out).toBeNull();
  });

  it('audit BUG #1: does NOT match on swap_quote.to (read tool — same token-symbol semantic)', () => {
    const tokenContacts = [
      { name: 'eth', address: '0xfake1111111111111111111111111111111111111111111111111111111111aa' },
    ];
    const out = detectResolvedContact(
      { from: 'SUI', to: 'ETH', amount: 1 },
      tokenContacts,
      'swap_quote',
    );
    expect(out).toBeNull();
  });

  it('audit BUG #1: STILL matches on send_transfer.to (the only tool where `to` is a recipient today)', () => {
    const out = detectResolvedContact(
      { to: 'Mom', amount: 5, asset: 'USDC' },
      CONTACTS_FIXTURE,
      'send_transfer',
    );
    expect(out).toEqual({ name: 'Mom', address: CONTACTS_FIXTURE[0].address });
  });

  it('audit BUG #1: when toolName is omitted, defaults to scanning ONLY `recipient` + `address` (conservative — neither is overloaded today)', () => {
    // Forward-compat caller without toolName context (e.g. a future host
    // hook that doesn't track tool identity). Should NOT match `to` —
    // can't tell whether `to` is recipient or token without toolName.
    expect(detectResolvedContact({ to: 'mom' }, CONTACTS_FIXTURE)).toBeNull();
    // But `recipient` + `address` keep working (universally recipient-ish).
    expect(detectResolvedContact({ recipient: 'mom' }, CONTACTS_FIXTURE)).toMatchObject({ name: 'Mom' });
    expect(detectResolvedContact({ address: 'sarah' }, CONTACTS_FIXTURE)).toMatchObject({ name: 'Sarah' });
  });
});

describe('applyEventToTimeline — P2.5b synthetic rows on pending_action (single-write)', () => {
  it('injects a contact-resolved row before the permission-card when input.to matches a contact', () => {
    const tl = applyEventToTimeline(
      [],
      {
        type: 'pending_action',
        action: {
          attemptId: 'att-1',
          toolName: 'send_transfer',
          toolUseId: 'tu1',
          input: { to: 'Mom', amount: 5 },
        } as never,
      },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(tl).toHaveLength(2);
    expect(tl[0]).toMatchObject({
      type: 'contact-resolved',
      contactName: 'Mom',
      contactAddress: CONTACTS_FIXTURE[0].address,
      toolUseId: 'tu1',
    });
    expect(tl[1]).toMatchObject({ type: 'permission-card', status: 'pending' });
  });

  it('does NOT inject a plan-stream row for single-write actions', () => {
    const tl = applyEventToTimeline(
      [],
      {
        type: 'pending_action',
        action: {
          attemptId: 'att-1',
          toolName: 'send_transfer',
          toolUseId: 'tu1',
          input: { to: 'Mom', amount: 5 },
        } as never,
      },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(tl.find((b) => b.type === 'plan-stream')).toBeUndefined();
  });

  it('omits the contact row when input.to is already a Sui address', () => {
    const tl = applyEventToTimeline(
      [],
      {
        type: 'pending_action',
        action: {
          attemptId: 'att-1',
          toolName: 'send_transfer',
          toolUseId: 'tu1',
          input: { to: '0xabcd000000000000000000000000000000000000000000000000000000000000', amount: 5 },
        } as never,
      },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].type).toBe('permission-card');
  });

  it('omits the contact row when contacts list is omitted (P2.5b opt-in)', () => {
    const tl = applyEventToTimeline(
      [],
      {
        type: 'pending_action',
        action: {
          attemptId: 'att-1',
          toolName: 'send_transfer',
          toolUseId: 'tu1',
          input: { to: 'Mom', amount: 5 },
        } as never,
      },
      T0,
      // no options arg
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].type).toBe('permission-card');
  });
});

describe('applyEventToTimeline — P2.5b synthetic rows on pending_action (bundle)', () => {
  const bundleAction = {
    attemptId: 'att-bundle-1',
    toolName: 'swap_execute',
    toolUseId: 'tu-bundle',
    input: { from: 'SUI', to: 'USDC', amount: 10 },
    steps: [
      {
        attemptId: 'att-step-1',
        toolName: 'swap_execute',
        toolUseId: 'tu-step-1',
        input: { from: 'SUI', to: 'USDC', amount: 10 },
      },
      {
        attemptId: 'att-step-2',
        toolName: 'send_transfer',
        toolUseId: 'tu-step-2',
        input: { to: 'Mom', amount: 5, asset: 'USDC' },
      },
    ],
  };

  it('appends contact rows + plan-stream + permission-card in that order', () => {
    const tl = applyEventToTimeline(
      [],
      { type: 'pending_action', action: bundleAction as never },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(tl).toHaveLength(3);
    expect(tl[0]).toMatchObject({ type: 'contact-resolved', contactName: 'Mom' });
    expect(tl[1]).toMatchObject({
      type: 'plan-stream',
      stepCount: 2,
      attemptId: 'att-bundle-1',
    });
    expect(tl[2]).toMatchObject({ type: 'permission-card', status: 'pending' });
  });

  it('audit BUG #1: a swap-and-save bundle with a contact named "USDC" (token symbol) does NOT phantom-inject a CONTACT row for the swap leg', () => {
    // Realistic regression: the headline use case for SPEC 7. The user
    // has a contact named "USDC" (e.g. a friend nicknamed after a token).
    // A `swap_execute → save_deposit` bundle's swap step has
    // `to: "USDC"` (target token), and the save step has no recipient.
    // Pre-fix this would have rendered "CONTACT · "USDC"" between the
    // upstream reads and the PLAN row — wildly wrong.
    const swapAndSave = {
      attemptId: 'att-sas-1',
      toolName: 'swap_execute',
      toolUseId: 'tu-sas',
      input: { from: 'SUI', to: 'USDC', amount: 10 },
      steps: [
        {
          attemptId: 'att-sas-1-step-1',
          toolName: 'swap_execute',
          toolUseId: 'tu-sas-step-1',
          input: { from: 'SUI', to: 'USDC', amount: 10 },
        },
        {
          attemptId: 'att-sas-1-step-2',
          toolName: 'save_deposit',
          toolUseId: 'tu-sas-step-2',
          input: { amount: 10, asset: 'USDC' },
        },
      ],
    };
    const contactsIncludingTokenName = [
      ...CONTACTS_FIXTURE,
      { name: 'USDC', address: '0xfake0000000000000000000000000000000000000000000000000000000000aa' },
    ];
    const tl = applyEventToTimeline(
      [],
      { type: 'pending_action', action: swapAndSave as never },
      T0,
      { contacts: contactsIncludingTokenName },
    );
    expect(tl.find((b) => b.type === 'contact-resolved')).toBeUndefined();
    expect(tl.find((b) => b.type === 'plan-stream')).toBeDefined();
    expect(tl.find((b) => b.type === 'permission-card')).toBeDefined();
  });

  it('audit BUG #1: a hybrid bundle with swap_execute (no recipient) + send_transfer (recipient="Mom") emits exactly ONE CONTACT row', () => {
    // The "swap to USDC and send to Mom" use case from the spec mocks.
    // The swap step's `to: "USDC"` must NOT fire a CONTACT row even when
    // the user has a contact named "USDC". The send_transfer step's
    // `to: "Mom"` should fire normally.
    const hybridBundle = {
      attemptId: 'att-h-1',
      toolName: 'swap_execute',
      toolUseId: 'tu-h',
      input: { from: 'SUI', to: 'USDC', amount: 10 },
      steps: [
        {
          attemptId: 'att-h-1-step-1',
          toolName: 'swap_execute',
          toolUseId: 'tu-h-step-1',
          input: { from: 'SUI', to: 'USDC', amount: 10 },
        },
        {
          attemptId: 'att-h-1-step-2',
          toolName: 'send_transfer',
          toolUseId: 'tu-h-step-2',
          input: { to: 'Mom', amount: 5, asset: 'USDC' },
        },
      ],
    };
    const contactsIncludingTokenName = [
      ...CONTACTS_FIXTURE,
      { name: 'USDC', address: '0xfake0000000000000000000000000000000000000000000000000000000000aa' },
    ];
    const tl = applyEventToTimeline(
      [],
      { type: 'pending_action', action: hybridBundle as never },
      T0,
      { contacts: contactsIncludingTokenName },
    );
    const contactRows = tl.filter((b) => b.type === 'contact-resolved') as ContactResolvedTimelineBlock[];
    expect(contactRows).toHaveLength(1);
    expect(contactRows[0].contactName).toBe('Mom');
  });

  it('dedups multi-leg references to the same contact (single contact row per (name,address))', () => {
    const dupAction = {
      ...bundleAction,
      steps: [
        bundleAction.steps[0],
        bundleAction.steps[1], // sends to Mom
        {
          attemptId: 'att-step-3',
          toolName: 'send_transfer',
          toolUseId: 'tu-step-3',
          input: { to: 'mom', amount: 2, asset: 'USDC' }, // also Mom (case-insensitive dup)
        },
      ],
    };
    const tl = applyEventToTimeline(
      [],
      { type: 'pending_action', action: dupAction as never },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    const contactRows = tl.filter((b) => b.type === 'contact-resolved');
    expect(contactRows).toHaveLength(1);
    expect((contactRows[0] as ContactResolvedTimelineBlock).contactName).toBe('Mom');
  });

  it('emits a contact row PER unique contact when bundle legs reference different contacts', () => {
    const multiAction = {
      ...bundleAction,
      steps: [
        {
          attemptId: 'att-step-1',
          toolName: 'send_transfer',
          toolUseId: 'tu-step-1',
          input: { to: 'Mom', amount: 5, asset: 'USDC' },
        },
        {
          attemptId: 'att-step-2',
          toolName: 'send_transfer',
          toolUseId: 'tu-step-2',
          input: { to: 'Sarah', amount: 5, asset: 'USDC' },
        },
      ],
    };
    const tl = applyEventToTimeline(
      [],
      { type: 'pending_action', action: multiAction as never },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    const contactRows = tl.filter((b) => b.type === 'contact-resolved') as ContactResolvedTimelineBlock[];
    expect(contactRows).toHaveLength(2);
    expect(contactRows.map((r) => r.contactName).sort()).toEqual(['Mom', 'Sarah']);
  });

  it('emits plan-stream even when no contact rows fire (rebalance bundle)', () => {
    const rebalance = {
      ...bundleAction,
      steps: [
        {
          attemptId: 'att-r1',
          toolName: 'swap_execute',
          toolUseId: 'tu-r1',
          input: { from: 'SUI', to: 'USDC', amount: 10 },
        },
        {
          attemptId: 'att-r2',
          toolName: 'swap_execute',
          toolUseId: 'tu-r2',
          input: { from: 'GOLD', to: 'USDC', amount: 1 },
        },
      ],
    };
    const tl = applyEventToTimeline(
      [],
      { type: 'pending_action', action: rebalance as never },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(tl.find((b) => b.type === 'contact-resolved')).toBeUndefined();
    const plan = tl.find((b) => b.type === 'plan-stream') as PlanStreamTimelineBlock | undefined;
    expect(plan).toBeDefined();
    expect(plan?.stepCount).toBe(2);
  });

  it('still finalizes streaming text/thinking before the synthetic rows (Bug F regression carries through)', () => {
    const tl = applyEventToTimeline(
      [
        { type: 'thinking', blockIndex: 0, text: 'planning', status: 'streaming' },
        { type: 'text', text: 'Compiling stream...', status: 'streaming' },
      ],
      { type: 'pending_action', action: bundleAction as never },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(tl[0]).toMatchObject({ type: 'thinking', status: 'done' });
    expect(tl[1]).toMatchObject({ type: 'text', status: 'done' });
    expect(tl[2]).toMatchObject({ type: 'contact-resolved' });
    expect(tl[3]).toMatchObject({ type: 'plan-stream' });
    expect(tl[4]).toMatchObject({ type: 'permission-card' });
  });
});

describe('applyEventToTimeline — P2.5b contact row on tool_start (forward-compat)', () => {
  it('injects a contact-resolved row before the tool block when input matches a contact', () => {
    // No auto-tier read takes a recipient field today, but the branch is
    // defensive for future tools. This locks the behavior so a future
    // contact-aware read tool gets the polish for free.
    const tl = applyEventToTimeline(
      [],
      {
        type: 'tool_start',
        toolName: 'future_recipient_lookup',
        toolUseId: 'tu1',
        input: { recipient: 'Sarah' },
      },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(tl).toHaveLength(2);
    expect(tl[0]).toMatchObject({ type: 'contact-resolved', contactName: 'Sarah' });
    expect(tl[1]).toMatchObject({ type: 'tool', toolUseId: 'tu1' });
  });

  it('also sweeps the contact row when tool_result.resultDeduped fires for that toolUseId', () => {
    // Use `recipient` (universally-scanned, not gated by toolName) so the
    // forward-compat tool name doesn't need to be on the
    // TOOLS_WHERE_TO_IS_RECIPIENT allow-list. The dedup-sweep behavior
    // is what we're locking in here, not the field-allow-list.
    const seed = applyEventToTimeline(
      [],
      {
        type: 'tool_start',
        toolName: 'future_recipient_lookup',
        toolUseId: 'tu1',
        input: { recipient: 'Mom' },
      },
      T0,
      { contacts: CONTACTS_FIXTURE },
    );
    expect(seed).toHaveLength(2); // contact row + tool block
    const next = applyEventToTimeline(
      seed,
      {
        type: 'tool_result',
        toolName: 'future_recipient_lookup',
        toolUseId: 'tu1',
        result: null,
        isError: false,
        resultDeduped: true,
      },
      T0 + 1,
    );
    expect(next).toHaveLength(0);
  });
});
