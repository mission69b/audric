/**
 * SPEC 7 P2.5b Layer 5 — PlanStreamBlockView render contract.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PlanStreamBlockView } from '../PlanStreamBlockView';
import type { PlanStreamTimelineBlock } from '@/lib/engine-types';

function block(stepCount: number): PlanStreamTimelineBlock {
  return { type: 'plan-stream', stepCount, attemptId: 'att-1' };
}

describe('PlanStreamBlockView', () => {
  it('renders PLAN STREAM with the bundle step count and ATOMIC tag', () => {
    const { container } = render(<PlanStreamBlockView block={block(2)} />);
    const text = container.textContent ?? '';
    expect(text).toContain('PLAN STREAM');
    expect(text).toContain('2 ops');
    expect(text).toContain('ATOMIC');
  });

  it('uses singular "op" copy when stepCount is exactly 1 (defensive — reducer never emits this, but the renderer has to be self-consistent)', () => {
    const { container } = render(<PlanStreamBlockView block={block(1)} />);
    expect(container.textContent ?? '').toContain('1 op');
    expect(container.textContent ?? '').not.toContain('1 ops');
  });

  it('exposes a screen-reader-friendly label with the operation count', () => {
    const { getByRole } = render(<PlanStreamBlockView block={block(3)} />);
    const status = getByRole('status');
    expect(status.getAttribute('aria-label')).toContain('3');
  });
});
