// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — ParallelToolsRow primitive tests (audit Gap C)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ParallelToolsRow } from '../ParallelToolsRow';

describe('ParallelToolsRow', () => {
  it('renders glyph, label, sub, and a "running" badge while running', () => {
    const { container, getByText } = render(
      <ParallelToolsRow
        glyph="📊"
        label="PORTFOLIO ANALYSIS"
        sub="querying…"
        status="running"
      />,
    );
    expect(getByText('📊')).toBeTruthy();
    expect(getByText('PORTFOLIO ANALYSIS')).toBeTruthy();
    expect(getByText('querying…')).toBeTruthy();
    // Pulsing dot indicates active.
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('switches to a "✓ DONE" badge with green dot + faint-green tint when done', () => {
    const { container, getByText } = render(
      <ParallelToolsRow
        glyph="💰"
        label="BALANCE CHECK"
        sub="ran in 0.4s"
        status="done"
      />,
    );
    expect(getByText('✓ DONE')).toBeTruthy();
    // Done rows pick up the success tint AND lose the pulsing animation.
    expect(container.querySelector('.animate-pulse')).toBeNull();
    // Tint class applied to the row root.
    expect(container.firstElementChild?.className).toContain('bg-success-bg/40');
  });

  it('switches to a "FAIL" badge with red dot + faint-red tint when error', () => {
    const { container, getByText } = render(
      <ParallelToolsRow
        glyph="📈"
        label="RATES INFO"
        sub="failed"
        status="error"
      />,
    );
    expect(getByText('FAIL')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('bg-error-bg/40');
  });

  it('switches to an "ABORT" badge with amber dot + faint-amber tint when interrupted', () => {
    const { container, getByText } = render(
      <ParallelToolsRow
        glyph="📋"
        label="TRANSACTION HISTORY"
        sub="interrupted"
        status="interrupted"
      />,
    );
    expect(getByText('ABORT')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('bg-warning-bg/40');
  });

  it('drops the bottom border on the last row of a group', () => {
    const { container } = render(
      <ParallelToolsRow
        glyph="📊"
        label="PORTFOLIO ANALYSIS"
        sub="ran in 0.4s"
        status="done"
        last
      />,
    );
    // No border-b utility on the last row.
    expect(container.firstElementChild?.className).not.toContain('border-b');
  });

  it('keeps the bottom border on non-last rows', () => {
    const { container } = render(
      <ParallelToolsRow
        glyph="📊"
        label="PORTFOLIO ANALYSIS"
        sub="ran in 0.4s"
        status="done"
      />,
    );
    expect(container.firstElementChild?.className).toContain('border-b');
  });
});
