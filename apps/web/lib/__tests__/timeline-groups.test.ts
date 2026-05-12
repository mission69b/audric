// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B2.3 — groupTimelineBlocks unit tests
//
// Locks the parallel-detection heuristic: adjacent tool blocks within
// 50ms group; everything else is a single. Also asserts the boundary
// behavior at exactly 50ms (excluded) and 49ms (included), and that
// non-tool blocks always close any open group.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { groupTimelineBlocks } from '@/lib/timeline-groups';
import type {
  TimelineBlock,
  ToolTimelineBlock,
  ThinkingTimelineBlock,
  TextTimelineBlock,
} from '@/lib/engine-types';

function tool(id: string, startedAt: number, name = 'balance_check'): ToolTimelineBlock {
  return {
    type: 'tool',
    toolUseId: id,
    toolName: name,
    input: {},
    status: 'done',
    startedAt,
    endedAt: startedAt + 100,
    result: null,
  };
}

function thinking(blockIndex: number, text = 't'): ThinkingTimelineBlock {
  return { type: 'thinking', blockIndex, text, status: 'done' };
}

function text(s: string): TextTimelineBlock {
  return { type: 'text', text: s, status: 'done' };
}

describe('groupTimelineBlocks', () => {
  it('returns an empty array for empty input', () => {
    expect(groupTimelineBlocks([])).toEqual([]);
  });

  it('renders a single tool as a single (length-1 groups never form)', () => {
    const out = groupTimelineBlocks([tool('a', 0)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: 'single', block: tool('a', 0) });
  });

  it('groups two tools that started within 50ms', () => {
    const blocks: TimelineBlock[] = [tool('a', 0), tool('b', 30)];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'group' });
    if (out[0].kind === 'group') expect(out[0].tools).toHaveLength(2);
  });

  it('does NOT group tools at exactly the 50ms boundary (threshold is exclusive)', () => {
    const blocks: TimelineBlock[] = [tool('a', 0), tool('b', 50)];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('single');
    expect(out[1].kind).toBe('single');
  });

  it('groups three back-to-back parallel tools', () => {
    const blocks: TimelineBlock[] = [tool('a', 0), tool('b', 10), tool('c', 25)];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    if (out[0].kind === 'group') expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['a', 'b', 'c']);
  });

  it('chains via "previous tool" (not first tool) — c can group with b even if c is far from a', () => {
    // a@0, b@40 (within 50ms of a), c@80 (within 50ms of b). All group together.
    const blocks: TimelineBlock[] = [tool('a', 0), tool('b', 40), tool('c', 80)];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    if (out[0].kind === 'group') expect(out[0].tools).toHaveLength(3);
  });

  it('closes the group when a non-tool block intervenes', () => {
    const blocks: TimelineBlock[] = [
      tool('a', 0),
      tool('b', 30), // groups with a
      text('between'),
      tool('c', 35), // distinct group / single (only one in run)
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(3);
    expect(out[0].kind).toBe('group');
    expect(out[1].kind).toBe('single');
    expect((out[1] as { kind: 'single'; block: TimelineBlock }).block.type).toBe('text');
    expect(out[2].kind).toBe('single');
  });

  it('closes the group when a tool starts more than 50ms after the previous tool', () => {
    const blocks: TimelineBlock[] = [
      tool('a', 0),
      tool('b', 30), // groups with a
      tool('c', 200), // too far → distinct
      tool('d', 220), // groups with c
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('group');
    expect(out[1].kind).toBe('group');
    if (out[0].kind === 'group') expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['a', 'b']);
    if (out[1].kind === 'group') expect(out[1].tools.map((t) => t.toolUseId)).toEqual(['c', 'd']);
  });

  it('preserves block order within a group', () => {
    const blocks: TimelineBlock[] = [tool('a', 0), tool('b', 10), tool('c', 20)];
    const out = groupTimelineBlocks(blocks);
    if (out[0].kind === 'group') {
      const ids = out[0].tools.map((t) => t.toolUseId);
      expect(ids).toEqual(['a', 'b', 'c']);
    }
  });

  it('non-tool blocks (thinking, text) are always rendered as singles', () => {
    const blocks: TimelineBlock[] = [thinking(0), text('hi'), thinking(2, 'more')];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(3);
    expect(out.every((it) => it.kind === 'single')).toBe(true);
  });

  it('matches a realistic agent turn (thinking → 3 parallel reads → text)', () => {
    const blocks: TimelineBlock[] = [
      thinking(0),
      tool('a', 100, 'balance_check'),
      tool('b', 110, 'rates_info'),
      tool('c', 130, 'health_check'),
      text('Here is your overview…'),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(3);
    expect(out[0].kind).toBe('single');
    expect(out[1].kind).toBe('group');
    expect(out[2].kind).toBe('single');
    if (out[1].kind === 'group') expect(out[1].tools).toHaveLength(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23A-A6 — post-write-refresh grouping
// ───────────────────────────────────────────────────────────────────────────

function pwr(id: string, startedAt: number, name = 'balance_check'): ToolTimelineBlock {
  return { ...tool(id, startedAt, name), source: 'pwr' };
}

describe('groupTimelineBlocks — post-write refresh (SPEC 23A-A6)', () => {
  it('groups two consecutive PWR tools as a pwr-group', () => {
    const blocks: TimelineBlock[] = [pwr('a', 0, 'balance_check'), pwr('b', 30, 'savings_info')];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('pwr-group');
    if (out[0].kind === 'pwr-group') expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['a', 'b']);
  });

  it('renders a single PWR tool as a pwr-group (framing IS the surface)', () => {
    const blocks: TimelineBlock[] = [pwr('a', 0)];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('pwr-group');
    if (out[0].kind === 'pwr-group') expect(out[0].tools).toHaveLength(1);
  });

  it('PWR rule wins over timing — a PWR tool never collapses into an LLM parallel run', () => {
    // Two LLM tools at 0/30 (would normally group), then a PWR at 50.
    // The PWR closes the LLM group and opens its own surface.
    const blocks: TimelineBlock[] = [
      tool('a', 0),
      tool('b', 30),
      pwr('c', 50),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('group');
    expect(out[1].kind).toBe('pwr-group');
    if (out[0].kind === 'group') expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['a', 'b']);
    if (out[1].kind === 'pwr-group') expect(out[1].tools.map((t) => t.toolUseId)).toEqual(['c']);
  });

  it('non-tool blocks close PWR runs the same way they close parallel runs', () => {
    const blocks: TimelineBlock[] = [
      pwr('a', 0),
      pwr('b', 30),
      text('Refreshed your wallet — here\'s the latest…'),
      pwr('c', 60),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(3);
    expect(out[0].kind).toBe('pwr-group');
    expect(out[1].kind).toBe('single');
    expect(out[2].kind).toBe('pwr-group');
  });

  it('LLM tools after a PWR run open a new parallel/single run (no cross-source contamination)', () => {
    const blocks: TimelineBlock[] = [
      pwr('a', 0),
      pwr('b', 10),
      tool('c', 20), // LLM, immediately after PWR — must NOT join the pwr-group
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('pwr-group');
    if (out[0].kind === 'pwr-group') expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['a', 'b']);
    expect(out[1].kind).toBe('single');
  });

  it('models a realistic post-write turn: write receipt → PWR refresh → narration', () => {
    // Simulates: bundle-receipt → balance_check (pwr) → savings_info (pwr) → text
    // Engine 1.28+ stamps both reads with source: 'pwr'.
    const blocks: TimelineBlock[] = [
      pwr('a', 100, 'balance_check'),
      pwr('b', 105, 'savings_info'),
      text('Saved. Your USDC balance is now $1,985.'),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('pwr-group');
    if (out[0].kind === 'pwr-group') expect(out[0].tools).toHaveLength(2);
    expect(out[1].kind).toBe('single');
  });

  it('user-source (regen) tools do NOT trigger pwr-group (only pwr does)', () => {
    const userTool: ToolTimelineBlock = { ...tool('a', 0), source: 'user' };
    const out = groupTimelineBlocks([userTool]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('single');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-MPP6 UX polish (2026-05-12) — regen-cluster grouping
//
// When 2+ pay_api blocks appear in the same message timeline (original +
// N regens), they group into a single side-by-side cluster anchored at
// the first pay_api position, regardless of timing or interleaved blocks.
// Closes the live-vs-rehydrated divergence: live regen no longer renders
// chronologically with the regen card stranded below text/PWR; both
// states now show the comparison up top with context below.
// ───────────────────────────────────────────────────────────────────────────

function payApi(id: string, startedAt: number, source?: 'llm' | 'user'): ToolTimelineBlock {
  return {
    ...tool(id, startedAt, 'pay_api'),
    ...(source ? { source } : {}),
  };
}

describe('groupTimelineBlocks — regen-cluster (SPEC 23B-MPP6 UX polish)', () => {
  it('groups two pay_api blocks far apart in time (live regen scenario, ~30s gap)', () => {
    const blocks: TimelineBlock[] = [payApi('orig', 0, 'llm'), payApi('regen', 30_000, 'user')];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('group');
    if (out[0].kind === 'group') {
      expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['orig', 'regen']);
    }
  });

  it('groups three pay_api blocks (original + 2 regens) regardless of timing', () => {
    const blocks: TimelineBlock[] = [
      payApi('orig', 0, 'llm'),
      payApi('regen1', 15_000, 'user'),
      payApi('regen2', 45_000, 'user'),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    if (out[0].kind === 'group') expect(out[0].tools).toHaveLength(3);
  });

  it('does NOT trigger regen-cluster for a single pay_api (existing single-emit path)', () => {
    const blocks: TimelineBlock[] = [payApi('orig', 0, 'llm')];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('single');
  });

  it('peels pay_api out of a mixed timeline: text + PWR end up AFTER the cluster', () => {
    // Models the exact live-regen scenario:
    //   text (LLM "I'll generate...") → orig pay_api → text ("Image generated $0.05") → PWR balance → regen pay_api
    // Expected: cluster anchored at orig position; the in-between text +
    // PWR get partitioned into the after-cluster recursion in their
    // original order (text first, then PWR).
    const blocks: TimelineBlock[] = [
      text("I'll generate a sunset image for you."),
      payApi('orig', 1_000, 'llm'),
      text('Image generated. Charged $0.05 USDC.'),
      pwr('bal', 12_000, 'balance_check'),
      payApi('regen', 30_000, 'user'),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(4);
    // [0] pre-pay_api narration as a single
    expect(out[0].kind).toBe('single');
    if (out[0].kind === 'single') expect(out[0].block.type).toBe('text');
    // [1] regen cluster (both pay_apis)
    expect(out[1].kind).toBe('group');
    if (out[1].kind === 'group') {
      expect(out[1].tools.map((t) => t.toolUseId)).toEqual(['orig', 'regen']);
    }
    // [2] post-pay_api narration text — emitted before the PWR because
    // the after-cluster partition preserves original block order
    expect(out[2].kind).toBe('single');
    if (out[2].kind === 'single') expect(out[2].block.type).toBe('text');
    // [3] PWR balance refresh — recursion routes it through the pwr-group rule
    expect(out[3].kind).toBe('pwr-group');
    if (out[3].kind === 'pwr-group') expect(out[3].tools.map((t) => t.toolUseId)).toEqual(['bal']);
  });

  it('cluster lands at the position of the FIRST pay_api (not last)', () => {
    // Pre-content (thinking + text) renders BEFORE the cluster.
    const blocks: TimelineBlock[] = [
      thinking(0),
      text('intro'),
      payApi('orig', 1_000, 'llm'),
      text('between'),
      payApi('regen', 30_000, 'user'),
      text('outro'),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(5);
    expect(out[0].kind).toBe('single'); // thinking
    expect(out[1].kind).toBe('single'); // intro text
    expect(out[2].kind).toBe('group'); // cluster
    expect(out[3].kind).toBe('single'); // 'between' text (deferred)
    expect(out[4].kind).toBe('single'); // 'outro' text
  });

  it('PWR run before the first pay_api stays as pwr-group above the cluster', () => {
    // Edge case: a PWR refresh from a prior write happens BEFORE the
    // pay_api dispatch. The pre-pay_api recursion must still detect it.
    const blocks: TimelineBlock[] = [
      pwr('bal-old', 0, 'balance_check'),
      pwr('sav-old', 5, 'savings_info'),
      payApi('orig', 100, 'llm'),
      payApi('regen', 30_000, 'user'),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('pwr-group');
    if (out[0].kind === 'pwr-group') expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['bal-old', 'sav-old']);
    expect(out[1].kind).toBe('group');
    if (out[1].kind === 'group') expect(out[1].tools.map((t) => t.toolUseId)).toEqual(['orig', 'regen']);
  });

  it('empty before/after partitions emit nothing extra (cluster only)', () => {
    const blocks: TimelineBlock[] = [payApi('a', 0, 'llm'), payApi('b', 30_000, 'user')];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('group');
  });

  it('does NOT bypass regen-cluster when one pay_api is interleaved with non-pay_api tools', () => {
    // pay_api + balance_check + pay_api should still cluster the two
    // pay_apis together, with the balance_check as a single in between
    // (or after, depending on partition).
    const blocks: TimelineBlock[] = [
      payApi('orig', 0, 'llm'),
      tool('bal', 10_000, 'balance_check'),
      payApi('regen', 30_000, 'user'),
    ];
    const out = groupTimelineBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('group');
    if (out[0].kind === 'group') {
      expect(out[0].tools.map((t) => t.toolUseId)).toEqual(['orig', 'regen']);
    }
    // The balance_check (non-PWR, just a regular tool) renders as a single after the cluster
    expect(out[1].kind).toBe('single');
    if (out[1].kind === 'single') {
      expect(out[1].block.type).toBe('tool');
      expect((out[1].block as ToolTimelineBlock).toolUseId).toBe('bal');
    }
  });
});
