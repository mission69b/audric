// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B2.3 — TodoBlockView smoke tests
//
// Asserts the renderer surfaces all three lifecycle statuses with the
// right glyph + a11y label, and gracefully renders nothing when the
// items array is empty (the LLM is allowed to "clear" the plan).
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TodoBlockView } from '../TodoBlockView';
import type { TodoTimelineBlock } from '@/lib/engine-types';

function makeBlock(items: TodoTimelineBlock['items']): TodoTimelineBlock {
  return {
    type: 'todo',
    toolUseId: 'todo-1',
    items,
    lastUpdatedAt: 0,
  };
}

describe('TodoBlockView', () => {
  it('renders all three statuses with the right glyph', () => {
    const { getByText, getAllByLabelText } = render(
      <TodoBlockView
        block={makeBlock([
          { id: '1', label: 'check balances', status: 'completed' },
          { id: '2', label: 'plan swap', status: 'in_progress' },
          { id: '3', label: 'execute swap', status: 'pending' },
        ])}
      />,
    );

    expect(getByText('check balances')).toBeTruthy();
    expect(getByText('plan swap')).toBeTruthy();
    expect(getByText('execute swap')).toBeTruthy();

    // a11y: each glyph carries an aria-label matching its status.
    expect(getAllByLabelText('completed')).toHaveLength(1);
    expect(getAllByLabelText('in_progress')).toHaveLength(1);
    expect(getAllByLabelText('pending')).toHaveLength(1);
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(<TodoBlockView block={makeBlock([])} />);
    expect(container.firstChild).toBeNull();
  });

  it('preserves item order from the block', () => {
    const { container } = render(
      <TodoBlockView
        block={makeBlock([
          { id: 'a', label: 'first', status: 'completed' },
          { id: 'b', label: 'second', status: 'in_progress' },
          { id: 'c', label: 'third', status: 'pending' },
        ])}
      />,
    );
    const labels = Array.from(container.querySelectorAll('li')).map((li) =>
      li.textContent?.trim().replace(/^[·→✓]\s*/u, ''),
    );
    expect(labels).toEqual(['first', 'second', 'third']);
  });
});
