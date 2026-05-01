// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.3 — ReasoningTimeline manual-state preservation (G8)
//
// The parent owns a `Map<blockIndex, expanded>` so a thinking block's
// expansion state survives:
//   1. Status transitions (streaming → done) — never re-seeds
//   2. Re-renders with new blocks added beside it — never re-seeds
//   3. User toggles — flip the map entry, persist for the lifetime of
//      this <ReasoningTimeline> (one per assistant message)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import { ReasoningTimeline } from '../ReasoningTimeline';
import type {
  ThinkingTimelineBlock,
  TimelineBlock,
  ToolTimelineBlock,
} from '@/lib/engine-types';

const T: (idx: number, status: 'streaming' | 'done', text?: string) => ThinkingTimelineBlock = (
  idx,
  status,
  text = `thinking ${idx}`,
) => ({ type: 'thinking', blockIndex: idx, text, status });

const TOOL: ToolTimelineBlock = {
  type: 'tool',
  toolUseId: 't-1',
  toolName: 'balance_check',
  input: {},
  status: 'running',
  startedAt: 0,
};

describe('ReasoningTimeline — thinking-block expansion (G8)', () => {
  it('auto-expands a streaming thinking block on first emission', () => {
    const blocks: TimelineBlock[] = [T(0, 'streaming', 'live thoughts…')];
    const { getByText } = render(<ReasoningTimeline blocks={blocks} isStreaming />);
    expect(getByText('live thoughts…')).toBeTruthy();
  });

  it('rehydrate case: thinking block already done → starts collapsed', () => {
    // No streaming phase observed by this renderer — the block is
    // already done at first mount. The body must NOT be visible until
    // the user clicks.
    const blocks: TimelineBlock[] = [T(0, 'done', 'past thoughts')];
    const { queryByText } = render(<ReasoningTimeline blocks={blocks} />);
    expect(queryByText('past thoughts')).toBeNull();
  });

  it('streaming → done transition does NOT auto-collapse a previously-expanded block', () => {
    // First render: streaming → auto-expanded (body visible)
    const streaming: TimelineBlock[] = [T(0, 'streaming', 'live thoughts')];
    const { rerender, getByText, queryByText } = render(
      <ReasoningTimeline blocks={streaming} isStreaming />,
    );
    expect(getByText('live thoughts')).toBeTruthy();

    // Re-render with the same block now `done` — without the manual-
    // state preservation logic the block would auto-collapse here.
    const done: TimelineBlock[] = [T(0, 'done', 'live thoughts')];
    rerender(<ReasoningTimeline blocks={done} />);
    expect(queryByText('live thoughts')).toBeTruthy();
  });

  it('user toggle persists across an unrelated block being added (no re-seed)', () => {
    // Start with a single done block — collapsed by default.
    const t0Only: TimelineBlock[] = [T(0, 'done', 'thought zero')];
    const { rerender, getByRole, getByText, queryByText } = render(
      <ReasoningTimeline blocks={t0Only} />,
    );
    expect(queryByText('thought zero')).toBeNull();

    // User clicks to expand.
    fireEvent.click(getByRole('button'));
    expect(getByText('thought zero')).toBeTruthy();

    // A new tool block arrives — re-render with `[t0, tool]`. The thinking
    // block must remain expanded (no re-seed of its expansion state just
    // because the surrounding block list grew).
    const withTool: TimelineBlock[] = [T(0, 'done', 'thought zero'), TOOL];
    rerender(<ReasoningTimeline blocks={withTool} isStreaming />);
    expect(getByText('thought zero')).toBeTruthy();
  });

  it('multi-burst: a NEW thinking block arrives streaming → only it is auto-expanded', () => {
    // Start with done block 0 — collapsed.
    const just0: TimelineBlock[] = [T(0, 'done', 'thought zero')];
    const { rerender, queryByText } = render(<ReasoningTimeline blocks={just0} />);
    expect(queryByText('thought zero')).toBeNull();

    // Add streaming block 1 (multi-burst thinking pattern).
    const both: TimelineBlock[] = [
      T(0, 'done', 'thought zero'),
      T(1, 'streaming', 'thought one'),
    ];
    rerender(<ReasoningTimeline blocks={both} isStreaming />);

    // Block 0 stays collapsed (was never user-toggled); block 1 auto-expands.
    expect(queryByText('thought zero')).toBeNull();
    expect(queryByText('thought one')).toBeTruthy();
  });

  it('per-message scope: separate <ReasoningTimeline> instances do not share state', () => {
    // Two SEQUENTIAL (not concurrent) renders prove a fresh map per
    // component. We `cleanup()` between them so the second render
    // queries against an empty document — otherwise testing-library's
    // queries can leak across renders that share the same global root.
    const blocks: TimelineBlock[] = [T(0, 'done', 'thought zero')];

    const a = render(<ReasoningTimeline blocks={blocks} />);
    fireEvent.click(within(a.container).getByRole('button'));
    expect(within(a.container).queryByText('thought zero')).toBeTruthy();
    cleanup();

    const b = render(<ReasoningTimeline blocks={blocks} />);
    // Second instance: no toggle yet → block stays collapsed.
    expect(within(b.container).queryByText('thought zero')).toBeNull();
  });
});
