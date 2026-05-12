// SPEC 23C C5 — TypingDots primitive tests
//
// Asserts:
//   1. Renders three dots.
//   2. ARIA: role="status" + aria-label so screen readers announce
//      "Composing response" without relying on the visual dots.
//   3. Doesn't crash when mounted.
//
// We DON'T branch-probe motion vs reduced-motion at the className
// level. Framer Motion's `useReducedMotion()` hook subscribes to
// matchMedia via a motion-value internal subscribe path that doesn't
// settle in the jsdom environment within React's effect cycle, so any
// test that probes the branch via waitFor times out. The reduced-
// motion code path is verified by code inspection (the
// `reduceMotion === false` gate in TypingDots.tsx) plus founder smoke
// in a real browser. This is the same testing constraint that applies
// to MountAnimate and ReceiptChoreography — see those test files for
// the same convention.

import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { TypingDots } from './TypingDots';

describe('<TypingDots />', () => {
  test('exposes role="status" + aria-label for screen readers', () => {
    const { getByRole } = render(<TypingDots />);
    const region = getByRole('status');
    expect(region.getAttribute('aria-label')).toBe('Composing response');
  });

  test('renders three dots', () => {
    const { container } = render(<TypingDots />);
    const dots = container.querySelectorAll('span.h-1.w-1');
    expect(dots.length).toBe(3);
  });

  test('does not crash on mount', () => {
    expect(() => render(<TypingDots />)).not.toThrow();
  });
});
