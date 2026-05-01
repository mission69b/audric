// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — HowIEvaluated primitive smoke tests (audit Gap C)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { HowIEvaluated } from '../HowIEvaluated';

describe('HowIEvaluated', () => {
  it('renders the disclosure header with chevron + label by default open', () => {
    const { getByText } = render(
      <HowIEvaluated>
        <div>body content</div>
      </HowIEvaluated>,
    );
    expect(getByText('How I evaluated this')).toBeTruthy();
    // Body is visible because defaultOpen=true.
    expect(getByText('body content')).toBeTruthy();
  });

  it('respects defaultOpen=false (body hidden until click)', () => {
    const { queryByText, getByRole } = render(
      <HowIEvaluated defaultOpen={false}>
        <div>secret body</div>
      </HowIEvaluated>,
    );
    expect(queryByText('secret body')).toBeNull();
    fireEvent.click(getByRole('button'));
    expect(queryByText('secret body')).toBeTruthy();
  });

  it('toggles open/closed on click', () => {
    const { queryByText, getByRole } = render(
      <HowIEvaluated defaultOpen={true}>
        <div>toggle target</div>
      </HowIEvaluated>,
    );
    expect(queryByText('toggle target')).toBeTruthy();
    fireEvent.click(getByRole('button'));
    expect(queryByText('toggle target')).toBeNull();
    fireEvent.click(getByRole('button'));
    expect(queryByText('toggle target')).toBeTruthy();
  });

  it('renders the meta badges joined with " · " when set', () => {
    const { container } = render(
      <HowIEvaluated tokens={75} model="audric v2.0" latency="1.4s">
        <div>x</div>
      </HowIEvaluated>,
    );
    // Meta is uppercased + joined with " · " — model gets uppercased,
    // tokens get the "TOKENS" suffix.
    expect(container.textContent).toContain('75 TOKENS');
    expect(container.textContent).toContain('AUDRIC V2.0');
    expect(container.textContent).toContain('1.4s');
  });

  it('omits the meta badge entirely when no fields are set', () => {
    const { container } = render(
      <HowIEvaluated>
        <div>x</div>
      </HowIEvaluated>,
    );
    // No "·" separator should appear in the header (only the chevron + label).
    const headerBtn = container.querySelector('button');
    expect(headerBtn?.textContent ?? '').not.toContain('·');
  });

  it('partial meta (only tokens) renders without dangling separators', () => {
    const { container } = render(
      <HowIEvaluated tokens="120">
        <div>x</div>
      </HowIEvaluated>,
    );
    expect(container.textContent).toContain('120 TOKENS');
    // Should not show the empty model / latency separators.
    expect(container.textContent).not.toMatch(/120 TOKENS\s*·\s*·/);
  });

  it('exposes aria-expanded on the disclosure button', () => {
    const { getByRole } = render(
      <HowIEvaluated defaultOpen={true}>
        <div>x</div>
      </HowIEvaluated>,
    );
    const btn = getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});
