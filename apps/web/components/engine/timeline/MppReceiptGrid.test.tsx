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
vi.mock('./ToolBlockView', () => ({
  ToolBlockView: ({ block }: { block: ToolTimelineBlock }) => (
    <div data-testid="tool-block" data-tool-use-id={block.toolUseId}>
      {block.toolName}
    </div>
  ),
}));

function mockTool(
  toolUseId: string,
  status: ToolTimelineBlock['status'] = 'done',
): ToolTimelineBlock {
  return {
    type: 'tool',
    toolName: 'pay_api',
    toolUseId,
    input: {},
    status,
    result: { paymentDigest: '0xabc' },
    isError: false,
    startedAt: 0,
    endedAt: 100,
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
