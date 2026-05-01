// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B2.3 — ThinkingBlockView smoke tests
//
// Two paths: the default thinking-text mode and the summaryMode
// "How I evaluated this" trust card. We don't snapshot the styling —
// we just assert that the right text + structured rows surface.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ThinkingBlockView } from '../ThinkingBlockView';
import type { ThinkingTimelineBlock } from '@/lib/engine-types';

const STREAMING: ThinkingTimelineBlock = {
  type: 'thinking',
  blockIndex: 0,
  text: 'Considering the swap…',
  status: 'streaming',
};

const DONE: ThinkingTimelineBlock = {
  ...STREAMING,
  status: 'done',
  signature: 'sig-x',
};

const SUMMARY: ThinkingTimelineBlock = {
  type: 'thinking',
  blockIndex: 1,
  text: 'raw thinking text the user never sees',
  status: 'done',
  summaryMode: true,
  evaluationItems: [
    { label: 'Has enough USDC', status: 'good', note: 'wallet $42.10' },
    { label: 'HF safe', status: 'good', note: 'HF=2.4' },
    { label: 'Slippage cap', status: 'warning', note: '0.8%' },
  ],
};

describe('ThinkingBlockView', () => {
  it('renders streaming text expanded by default', () => {
    const { getByText, queryByText } = render(<ThinkingBlockView block={STREAMING} />);
    expect(getByText('Reasoning…')).toBeTruthy();
    // Body is shown while streaming.
    expect(getByText('Considering the swap…')).toBeTruthy();
    expect(queryByText('How I evaluated this')).toBeNull();
  });

  it('renders done text collapsed; toggles open on click', () => {
    const { getByRole, queryByText } = render(<ThinkingBlockView block={DONE} />);
    // Body is hidden until the user clicks the disclosure button.
    expect(queryByText('Considering the swap…')).toBeNull();
    fireEvent.click(getByRole('button'));
    expect(queryByText('Considering the swap…')).toBeTruthy();
  });

  it('renders summaryMode card with all evaluation items + statuses (does NOT show raw thinking)', () => {
    const { getByText, getAllByLabelText, queryByText } = render(
      <ThinkingBlockView block={SUMMARY} />,
    );
    expect(getByText('How I evaluated this')).toBeTruthy();
    expect(getByText('Has enough USDC')).toBeTruthy();
    expect(getByText('HF safe')).toBeTruthy();
    expect(getByText('Slippage cap')).toBeTruthy();

    // Status glyphs by aria-label — 2 good + 1 warning, no critical/info.
    expect(getAllByLabelText('good')).toHaveLength(2);
    expect(getAllByLabelText('warning')).toHaveLength(1);

    // Privacy invariant — raw thinking text never leaks when summaryMode is on.
    expect(queryByText('raw thinking text the user never sees')).toBeNull();
  });

  it('renders nothing when block has neither summary nor text', () => {
    const empty: ThinkingTimelineBlock = {
      type: 'thinking',
      blockIndex: 0,
      text: '',
      status: 'done',
    };
    const { container } = render(<ThinkingBlockView block={empty} />);
    expect(container.firstChild).toBeNull();
  });
});
