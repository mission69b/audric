// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — ThinkingHeader primitive smoke tests (audit Gap C)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ThinkingHeader } from '../ThinkingHeader';

describe('ThinkingHeader', () => {
  it('renders the pulsing "A" avatar + "THINKING…" label while not done', () => {
    const { container, getByText } = render(<ThinkingHeader done={false} />);
    expect(getByText('THINKING…')).toBeTruthy();
    expect(getByText('A')).toBeTruthy();
    // Both the avatar and the label use animate-pulse while streaming.
    expect(container.querySelectorAll('.animate-pulse').length).toBe(2);
  });

  it('renders the green-check avatar + "THOUGHT" label when done', () => {
    const { container, getByText, queryByText } = render(
      <ThinkingHeader done={true} />,
    );
    expect(getByText('THOUGHT')).toBeTruthy();
    expect(queryByText('A')).toBeNull();
    // No pulse classes on the done state.
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    // Check glyph is an inline svg.
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders a custom label override (e.g. SPEC 9 EVALUATING…)', () => {
    const { getByText, queryByText } = render(
      <ThinkingHeader done={false} label="EVALUATING…" />,
    );
    expect(getByText('EVALUATING…')).toBeTruthy();
    expect(queryByText('THINKING…')).toBeNull();
  });

  it('renders without onClick → no button, just a status div', () => {
    const { container, queryByRole } = render(<ThinkingHeader done={false} />);
    expect(queryByRole('button')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it('renders with onClick → becomes a button + invokes handler on click', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <ThinkingHeader done={false} onClick={onClick} expanded={false} />,
    );
    const btn = getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reflects expanded prop through aria-expanded', () => {
    const { getByRole } = render(
      <ThinkingHeader done={false} onClick={() => {}} expanded={true} />,
    );
    expect(getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });
});
