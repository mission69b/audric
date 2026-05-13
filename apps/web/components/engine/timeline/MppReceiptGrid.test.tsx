/**
 * SPEC 23B-MPP5 — MppReceiptGrid visual + layout tests (2026-05-12).
 *
 * The grid is a thin layout wrapper around `<ToolBlockView>`, so most of
 * its behavior is structural (CSS grid columns + min-width clamp). Tests
 * focus on:
 *   - Empty / single-tool / multi-tool render shapes.
 *   - Settled-only filter (running tools excluded from grid cells).
 *   - SPEC 16 subtitle slot (renders when set, omitted when undefined).
 *   - isStreaming gate (no cards rendered while message is mid-stream).
 *   - Responsive grid template (auto-fit, minmax(280px, 1fr)).
 *
 * Convention: this codebase does NOT extend `@testing-library/jest-dom`.
 * Tests use raw DOM API (`textContent`, `querySelector`).
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MppReceiptGrid } from './MppReceiptGrid';
import type { ToolTimelineBlock } from '@/lib/engine-types';

// Mock ToolBlockView so we don't have to set up a full tool result render
// stack. The grid's job is layout; per-cell content is the renderer's job.
// `data-has-on-send-message` lets the B-MPP5-fix1 regression assert that
// `onSendMessage` is threaded through to each per-cell ToolBlockView.
vi.mock('./ToolBlockView', () => ({
  ToolBlockView: ({
    block,
    onSendMessage,
    isSuperseded,
    isRegenerating,
  }: {
    block: ToolTimelineBlock;
    onSendMessage?: (text: string) => void;
    isSuperseded?: boolean;
    isRegenerating?: boolean;
  }) => (
    <div
      data-testid="tool-block"
      data-tool-use-id={block.toolUseId}
      data-has-on-send-message={onSendMessage ? 'true' : 'false'}
      data-superseded={isSuperseded ? 'true' : 'false'}
      data-regenerating={isRegenerating ? 'true' : 'false'}
    >
      {block.toolName}
    </div>
  ),
}));

function mockTool(
  toolUseId: string,
  status: ToolTimelineBlock['status'] = 'done',
  startedAt = 0,
): ToolTimelineBlock {
  return {
    type: 'tool',
    toolName: 'pay_api',
    toolUseId,
    input: {},
    status,
    result: { paymentDigest: '0xabc' },
    isError: false,
    startedAt,
    endedAt: startedAt + 100,
  } as ToolTimelineBlock;
}

describe('MppReceiptGrid — render shapes', () => {
  it('returns null for empty tools array', () => {
    const { container } = render(<MppReceiptGrid tools={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when no tools are settled (all still running)', () => {
    const { container } = render(
      <MppReceiptGrid tools={[mockTool('a', 'running'), mockTool('b', 'running')]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders 2 grid cells for 2 settled tools', () => {
    const { getAllByTestId } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    const blocks = getAllByTestId('tool-block');
    expect(blocks.length).toBe(2);
    expect(blocks[0].getAttribute('data-tool-use-id')).toBe('a');
    expect(blocks[1].getAttribute('data-tool-use-id')).toBe('b');
  });

  it('renders 4 grid cells for 4 settled tools', () => {
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[mockTool('a'), mockTool('b'), mockTool('c'), mockTool('d')]}
      />,
    );
    expect(getAllByTestId('tool-block').length).toBe(4);
  });

  it('filters out running tools, only settled get grid cells', () => {
    // 4 tools: 2 done + 1 running + 1 error → 3 cells (done + done + error)
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('a', 'done'),
          mockTool('b', 'done'),
          mockTool('c', 'running'),
          mockTool('d', 'error'),
        ]}
      />,
    );
    const blocks = getAllByTestId('tool-block');
    expect(blocks.length).toBe(3);
    expect(blocks.map((b) => b.getAttribute('data-tool-use-id'))).toEqual([
      'a',
      'b',
      'd',
    ]);
  });
});

describe('MppReceiptGrid — CSS grid layout', () => {
  it('uses CSS grid with auto-fit + minmax(280px, 1fr)', () => {
    const { container } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    const grid = container.querySelector('.grid') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.style.gridTemplateColumns).toBe(
      'repeat(auto-fit, minmax(280px, 1fr))',
    );
  });

  it('grid container has the role="group" + aria-label for cluster identity', () => {
    const { container } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    const group = container.querySelector('[role="group"]') as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.getAttribute('aria-label')).toBe('MPP receipt cluster');
  });

  it('applies gap-2 between cells', () => {
    const { container } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    expect(container.querySelector('.gap-2')).not.toBeNull();
  });

  it('each cell has min-w-0 so long content (e.g. wide pre/code) does not blow out the grid', () => {
    const { container } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    const cells = container.querySelectorAll('.min-w-0');
    expect(cells.length).toBe(2);
  });
});

describe('MppReceiptGrid — SPEC 16 subtitle slot', () => {
  it('omits the subtitle row when undefined (today\'s default)', () => {
    const { container } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    expect(container.querySelector('[aria-label="MPP cluster subtitle"]')).toBeNull();
  });

  it('renders the subtitle row when set (SPEC 16 ATOMIC PAYMENT INTENT label)', () => {
    const { container, getByText } = render(
      <MppReceiptGrid
        tools={[mockTool('a'), mockTool('b')]}
        subtitle="ATOMIC PAYMENT INTENT · 4 SERVICES · $0.20 TOTAL"
      />,
    );
    const subtitle = container.querySelector(
      '[aria-label="MPP cluster subtitle"]',
    );
    expect(subtitle).not.toBeNull();
    expect(getByText('ATOMIC PAYMENT INTENT · 4 SERVICES · $0.20 TOTAL')).toBeTruthy();
  });

  it('subtitle uses MPP-family chrome (mono caps, tracking-[0.12em])', () => {
    const { container } = render(
      <MppReceiptGrid
        tools={[mockTool('a'), mockTool('b')]}
        subtitle="SOME LABEL"
      />,
    );
    const subtitle = container.querySelector(
      '[aria-label="MPP cluster subtitle"]',
    ) as HTMLElement;
    expect(subtitle.className).toContain('font-mono');
    expect(subtitle.className).toContain('uppercase');
    expect(subtitle.className).toContain('tracking-[0.12em]');
  });
});

describe('MppReceiptGrid — onSendMessage prop drilling (B-MPP5 fix1)', () => {
  it('threads onSendMessage to every per-cell ToolBlockView when set', () => {
    const onSendMessage = vi.fn();
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[mockTool('a'), mockTool('b')]}
        onSendMessage={onSendMessage}
      />,
    );
    const blocks = getAllByTestId('tool-block');
    expect(blocks.length).toBe(2);
    for (const block of blocks) {
      expect(block.getAttribute('data-has-on-send-message')).toBe('true');
    }
  });

  it('per-cell onSendMessage is undefined when caller does not pass it (matches pre-fix behavior for non-pay_api callers)', () => {
    const { getAllByTestId } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    const blocks = getAllByTestId('tool-block');
    for (const block of blocks) {
      expect(block.getAttribute('data-has-on-send-message')).toBe('false');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// [SPEC 23C C10 production regression / 2026-05-13]
//
// Production smoke caught BOTH original and regen ReviewCards rendering
// full footers after a TTS regen. Root cause (in ReviewCard.test.tsx):
// the tool block re-parents from BlockRouter to MppReceiptGrid on
// regen-cluster formation, losing local `clicked: 'regenerated'`
// state.
//
// Fix: derive supersede state from sibling data and forward through
// ToolBlockView → ToolResultCard → renderer → ReviewCard. The latest
// pay_api in the cluster (highest startedAt) stays interactive; every
// earlier one is superseded → `isSuperseded={true}`.
// ─────────────────────────────────────────────────────────────────────

describe('MppReceiptGrid — supersede threading (C10 regression)', () => {
  it('marks every cell except the latest as isSuperseded=true', () => {
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('a', 'done', 1000),
          mockTool('b', 'done', 2000),
          mockTool('c', 'done', 3000),
        ]}
      />,
    );
    const blocks = getAllByTestId('tool-block');
    expect(blocks.length).toBe(3);
    const map = new Map(
      blocks.map((b) => [b.getAttribute('data-tool-use-id')!, b.getAttribute('data-superseded')!]),
    );
    expect(map.get('a')).toBe('true');
    expect(map.get('b')).toBe('true');
    expect(map.get('c')).toBe('false');
  });

  // [SPEC 23C C10 followup / 2026-05-13] Was "the latest is determined
  // by startedAt, not by array order". Founder smoke caught the layout
  // drift bug: synthesizeTimelineFromMessage stamps startedAt=0 on
  // every block during rehydration, so on page refresh the startedAt
  // reduce ties on 0, falls back to lexical toolUseId compare (random
  // nanoid), and picks the wrong card as latest ~50% of the time.
  // Fix: trust array position, which IS the chronological order in
  // both live (dispatch-order append) and rehydrated (m.tools[] iter)
  // paths. The renamed test below pins the new contract.
  it('the latest is determined by array position (last cell wins)', () => {
    // Caller's responsibility to pass tools in chronological order.
    // Both live and rehydrated paths uphold this — see the latestId
    // comment in MppReceiptGrid.tsx for the per-path proof.
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('first', 'done', 1000),
          mockTool('second', 'done', 2000),
          mockTool('latest-by-position', 'done', 3000),
        ]}
      />,
    );
    const map = new Map(
      getAllByTestId('tool-block').map((b) => [
        b.getAttribute('data-tool-use-id')!,
        b.getAttribute('data-superseded')!,
      ]),
    );
    expect(map.get('first')).toBe('true');
    expect(map.get('second')).toBe('true');
    expect(map.get('latest-by-position')).toBe('false');
  });

  // [SPEC 23C C10 followup / 2026-05-13 — the actual regression]
  // Pin the rehydration scenario: synthesizeTimelineFromMessage stamps
  // startedAt=0 on every rehydrated block. The pre-fix reduce tied on
  // 0 and fell back to a lexical toolUseId compare (random nanoid),
  // which picked the wrong card ~50% of the time. The new array-
  // position contract MUST work even when every startedAt is 0,
  // including when the lexically-larger toolUseId sits in the
  // non-latest slot (the failing case that surfaced the bug).
  it('rehydrated path (all startedAt=0): array position decides, not lexical toolUseId', () => {
    // Lexically: "z-original" > "a-regen". Pre-fix would have picked
    // "z-original" as latest because the reduce's tie-break chose the
    // higher toolUseId. Post-fix: array position wins, "a-regen" (last
    // in the array → chronologically latest by storage order) is the
    // active card.
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('z-original', 'done', 0),
          mockTool('a-regen', 'done', 0),
        ]}
      />,
    );
    const map = new Map(
      getAllByTestId('tool-block').map((b) => [
        b.getAttribute('data-tool-use-id')!,
        b.getAttribute('data-superseded')!,
      ]),
    );
    expect(map.get('z-original')).toBe('true');
    expect(map.get('a-regen')).toBe('false');
  });

  it('single-tool cluster: the only cell is NOT superseded', () => {
    // Defensive — single-pay_api clusters rarely route through
    // MppReceiptGrid in production (the regen-cluster pre-pass triggers
    // on >=2 pay_api blocks) but the logic must still be correct.
    const { getAllByTestId } = render(
      <MppReceiptGrid tools={[mockTool('only', 'done', 1000)]} />,
    );
    const blocks = getAllByTestId('tool-block');
    expect(blocks.length).toBe(1);
    expect(blocks[0].getAttribute('data-superseded')).toBe('false');
  });

  it('errored tool can still be the latest (supersede ignores status)', () => {
    // If the user regenerated and the regen errored, the errored card
    // is still the latest dispatch — the original is still superseded.
    // (The errored card surfaces its own retry chip via ReviewCard's
    // existing error path; that's orthogonal to supersede.)
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('original', 'done', 1000),
          mockTool('regen-failed', 'error', 2000),
        ]}
      />,
    );
    const map = new Map(
      getAllByTestId('tool-block').map((b) => [
        b.getAttribute('data-tool-use-id')!,
        b.getAttribute('data-superseded')!,
      ]),
    );
    expect(map.get('original')).toBe('true');
    expect(map.get('regen-failed')).toBe('false');
  });
});

// ─────────────────────────────────────────────────────────────────────
// SPEC 23C C10 followup #3 / 2026-05-13 — `isRegenerating` derivation
//
// Founder smoke 2026-05-13 ~16:30 AEST after the c5c9a3f + 7c1d12d
// ships caught: when the user taps Regenerate on a SINGLE pay_api card
// (before the cluster forms), the AudricMark + "Regenerating…" UI
// shows for ~50ms then disappears for the entire 38s vendor wait.
//
// Root cause: regenerateToolCall step 3 upserts the new pay_api block
// at status='running' → groupTimelineBlocks flips the kind from
// 'single' to 'regen-group' → ReviewCard unmounts from BlockRouter,
// remounts inside MppReceiptGrid → local clicked='regenerating' state
// is lost → AudricMark gone.
//
// Fix: same supersede pattern. Derive "regen-in-flight" from sibling
// data — if the cluster contains a non-settled pay_api block, the
// latest settled card is the regen source. Pass that signal down via
// a new `isRegenerating` prop chain (MppReceiptGrid → ToolBlockView
// → ToolResultCard → renderMppService → ReviewCard.forceRegenerating).
// ─────────────────────────────────────────────────────────────────────

describe('MppReceiptGrid — isRegenerating threading (followup #3 regression)', () => {
  it('marks the latest settled cell as isRegenerating=true when a sibling is running', () => {
    // Simulates the exact moment after the user taps Regenerate on a
    // single card: regenerateToolCall has called upsertToolBlock with
    // status='running' for the new pay_api, and the timeline now has
    // [original (done), new-regen (running)]. The ORIGINAL is the
    // latest settled → it gets isRegenerating=true so the AudricMark
    // survives the remount that just happened.
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('original-done', 'done', 1000),
          mockTool('regen-in-flight', 'running', 2000),
        ]}
      />,
    );
    // Only settled cells render; the running cell is filtered out.
    const blocks = getAllByTestId('tool-block');
    expect(blocks.length).toBe(1);
    const original = blocks[0];
    expect(original.getAttribute('data-tool-use-id')).toBe('original-done');
    expect(original.getAttribute('data-regenerating')).toBe('true');
    // Latest settled → not superseded.
    expect(original.getAttribute('data-superseded')).toBe('false');
  });

  it('flips isRegenerating back to false once the regen settles', () => {
    // After ~38s the new pay_api lands. tools=[original (done), regen
    // (done)]. settled.length === tools.length → regenInFlight=false.
    // Original becomes superseded; new regen becomes the latest with
    // a fully-interactive footer (no isRegenerating override needed).
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('original-done', 'done', 1000),
          mockTool('regen-settled', 'done', 2000),
        ]}
      />,
    );
    const map = new Map(
      getAllByTestId('tool-block').map((b) => [
        b.getAttribute('data-tool-use-id')!,
        {
          superseded: b.getAttribute('data-superseded'),
          regenerating: b.getAttribute('data-regenerating'),
        },
      ]),
    );
    expect(map.get('original-done')).toEqual({
      superseded: 'true',
      regenerating: 'false',
    });
    expect(map.get('regen-settled')).toEqual({
      superseded: 'false',
      regenerating: 'false',
    });
  });

  it('handles 3-card cluster mid-regen — only the latest settled gets isRegenerating', () => {
    // User regen'd the original, then immediately regen'd the regen.
    // tools=[original (done), regen-1 (done), regen-2 (running)].
    // settled=[original, regen-1]. latestId=regen-1. regenInFlight=true.
    // Original is superseded. Regen-1 is the latest settled AND is the
    // source of the in-flight regen-2 → AudricMark.
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('original', 'done', 1000),
          mockTool('regen-1', 'done', 2000),
          mockTool('regen-2-in-flight', 'running', 3000),
        ]}
      />,
    );
    const map = new Map(
      getAllByTestId('tool-block').map((b) => [
        b.getAttribute('data-tool-use-id')!,
        {
          superseded: b.getAttribute('data-superseded'),
          regenerating: b.getAttribute('data-regenerating'),
        },
      ]),
    );
    expect(map.get('original')).toEqual({
      superseded: 'true',
      regenerating: 'false',
    });
    expect(map.get('regen-1')).toEqual({
      superseded: 'false',
      regenerating: 'true',
    });
    // running cell is not in the rendered set
    expect(map.has('regen-2-in-flight')).toBe(false);
  });

  it('streaming sibling also triggers isRegenerating=true (not just running)', () => {
    // Defensive — engine status enum has both 'streaming' and 'running'
    // for non-terminal pay_api dispatches. Both should trigger the
    // regen-in-flight derivation. The current pay_api flow uses
    // 'running' but text-result MPP tools may use 'streaming' if the
    // result streams in chunks. The derivation must not silently skip.
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[
          mockTool('original-done', 'done', 1000),
          mockTool('regen-streaming', 'streaming', 2000),
        ]}
      />,
    );
    const original = getAllByTestId('tool-block')[0];
    expect(original.getAttribute('data-regenerating')).toBe('true');
  });
});

describe('MppReceiptGrid — isStreaming gate', () => {
  it('does NOT render any cells while isStreaming === true', () => {
    const { queryAllByTestId } = render(
      <MppReceiptGrid
        tools={[mockTool('a'), mockTool('b')]}
        isStreaming
      />,
    );
    expect(queryAllByTestId('tool-block').length).toBe(0);
  });

  it('renders cells normally when isStreaming === false', () => {
    const { getAllByTestId } = render(
      <MppReceiptGrid
        tools={[mockTool('a'), mockTool('b')]}
        isStreaming={false}
      />,
    );
    expect(getAllByTestId('tool-block').length).toBe(2);
  });

  it('renders cells when isStreaming is undefined (defaults to false)', () => {
    const { getAllByTestId } = render(
      <MppReceiptGrid tools={[mockTool('a'), mockTool('b')]} />,
    );
    expect(getAllByTestId('tool-block').length).toBe(2);
  });
});
