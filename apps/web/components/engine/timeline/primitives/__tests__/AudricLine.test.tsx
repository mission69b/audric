// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — AudricLine primitive smoke tests (audit Gap C)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AudricLine } from '../AudricLine';

describe('AudricLine', () => {
  it('renders the leading ✦ sparkle + child content', () => {
    const { container, getByText } = render(<AudricLine>hello</AudricLine>);
    expect(getByText('hello')).toBeTruthy();
    // Sparkle is aria-hidden so screen readers skip it.
    const sparkle = container.querySelector('[aria-hidden="true"]');
    expect(sparkle?.textContent).toBe('✦');
  });

  it('uses the success-solid colour for the sparkle (visual identity)', () => {
    const { container } = render(<AudricLine>x</AudricLine>);
    const sparkle = container.querySelector('[aria-hidden="true"]');
    expect(sparkle?.className).toContain('text-success-solid');
  });

  it('honours ariaLive="polite" while streaming', () => {
    const { container } = render(
      <AudricLine ariaLive="polite">streaming</AudricLine>,
    );
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('defaults to aria-live="off" for terminal text', () => {
    const { container } = render(<AudricLine>done</AudricLine>);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-live')).toBe('off');
  });

  it('forwards extra className to the root element', () => {
    const { container } = render(
      <AudricLine className="my-extra-class">x</AudricLine>,
    );
    const root = container.firstElementChild;
    expect(root?.className).toContain('my-extra-class');
  });
});
