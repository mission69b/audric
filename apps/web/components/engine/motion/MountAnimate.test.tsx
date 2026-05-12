// SPEC 23C C1 — MountAnimate primitive tests
//
// Asserts:
//   1. Children render unconditionally (mount animation never gates content).
//   2. The wrapper is a div (so layout integrity is preserved).
//   3. Custom className passes through to the wrapper.
//   4. Multiple staggerIndex values produce different elements but all
//      eventually render their children (we can't easily measure delays
//      in jsdom — that's verified by the matchMedia-mocked instant
//      transition path; the per-stagger delay is an integration concern
//      that visual smoke catches).
//
// The matchMedia mock in vitest.setup.ts forces useReducedMotion → true,
// which collapses MountAnimate to opacity-only with 0ms duration. This
// keeps tests fast AND verifies the C8 reduced-motion path works.

import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { MountAnimate } from './MountAnimate';

describe('<MountAnimate />', () => {
  test('renders children unconditionally', () => {
    const { getByText } = render(
      <MountAnimate>
        <span>hello</span>
      </MountAnimate>,
    );
    expect(getByText('hello')).toBeTruthy();
  });

  test('wraps children in a single div (layout-preserving)', () => {
    const { container } = render(
      <MountAnimate>
        <span data-testid="child">child</span>
      </MountAnimate>,
    );
    // motion.div renders as a div in the DOM
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(container.firstElementChild?.querySelector('[data-testid="child"]')).toBeTruthy();
  });

  test('passes custom className to the wrapper', () => {
    const { container } = render(
      <MountAnimate className="my-custom-class">
        <span>x</span>
      </MountAnimate>,
    );
    expect(container.firstElementChild?.className).toContain('my-custom-class');
  });

  test('subtle intensity still renders children', () => {
    const { getByText } = render(
      <MountAnimate intensity="subtle">
        <span>subtle</span>
      </MountAnimate>,
    );
    expect(getByText('subtle')).toBeTruthy();
  });

  test('staggerIndex does not affect visibility (children always render)', () => {
    const { getByText } = render(
      <MountAnimate staggerIndex={5}>
        <span>delayed</span>
      </MountAnimate>,
    );
    expect(getByText('delayed')).toBeTruthy();
  });

  test('multiple instances each render their own child', () => {
    const { getByText } = render(
      <>
        <MountAnimate staggerIndex={0}>
          <span>a</span>
        </MountAnimate>
        <MountAnimate staggerIndex={1}>
          <span>b</span>
        </MountAnimate>
        <MountAnimate staggerIndex={2}>
          <span>c</span>
        </MountAnimate>
      </>,
    );
    expect(getByText('a')).toBeTruthy();
    expect(getByText('b')).toBeTruthy();
    expect(getByText('c')).toBeTruthy();
  });
});
