// SPEC 23C C3 — NumberTicker primitive tests
//
// Asserts:
//   1. First-mount renders the formatted TARGET value SYNCHRONOUSLY
//      (no count-up from zero — see top-of-file JSDoc rationale on
//      why first mount is a no-op for this primitive).
//   2. Custom format function is applied.
//   3. Wrapper is a <span> + accepts className.
//   4. Subsequent value changes settle to the new target (with
//      reduced-motion forcing instant snap; full-motion tween path
//      can't be measured in jsdom without fake-timer ceremony, so
//      we just verify final state).
//
// The matchMedia mock in vitest.setup.ts forces useReducedMotion to
// resolve to true. So in tests, value-change updates skip the tween
// and snap to the target immediately.

import { describe, expect, test } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { NumberTicker } from './NumberTicker';

describe('<NumberTicker />', () => {
  test('renders the formatted target value SYNCHRONOUSLY on first mount (no count-up)', () => {
    const { container } = render(
      <NumberTicker value={1234.56} format={(n) => `$${n.toFixed(2)}`} />,
    );
    // Synchronous — no waitFor needed. This is the contract: first
    // mount == target value, no animation. Critical for SSR /
    // hydration / synchronous test assertions.
    expect(container.textContent).toBe('$1234.56');
  });

  test('applies a custom format function', () => {
    const { container } = render(
      <NumberTicker
        value={4.21}
        format={(n) => `HF · ${n.toFixed(2)}`}
      />,
    );
    expect(container.textContent).toBe('HF · 4.21');
  });

  test('handles zero gracefully', () => {
    const { container } = render(
      <NumberTicker value={0} format={(n) => `${n}%`} />,
    );
    expect(container.textContent).toBe('0%');
  });

  test('renders a span wrapper by default', () => {
    const { container } = render(
      <NumberTicker value={100} format={(n) => `${n}`} />,
    );
    expect(container.firstElementChild?.tagName).toBe('SPAN');
  });

  test('passes through className prop', () => {
    const { container } = render(
      <NumberTicker
        value={100}
        format={(n) => `${n}`}
        className="font-mono text-success-solid"
      />,
    );
    expect(container.firstElementChild?.className).toContain('font-mono');
    expect(container.firstElementChild?.className).toContain('text-success-solid');
  });

  test('updates the displayed value when value prop changes (reduced-motion: instant snap)', async () => {
    const { container, rerender } = render(
      <NumberTicker value={100} format={(n) => `${n}`} />,
    );
    expect(container.textContent).toBe('100');
    rerender(<NumberTicker value={200} format={(n) => `${n}`} />);
    // useEffect runs on the rerender, calls setDisplayed(format(200))
    // because reduced-motion is true.
    await waitFor(() => {
      expect(container.textContent).toBe('200');
    });
  });
});
