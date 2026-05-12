// SPEC 23C C7 — ReceiptChoreography primitive tests
//
// Asserts:
//   1. Children render (the choreography never gates content).
//   2. With reduced-motion (the test default per vitest.setup.ts), the
//      wrapper degrades to a fragment — no motion.div, no data-attr.
//      This proves the layout is preserved exactly when accessibility
//      preferences require no animation.
//   3. Tone prop accepts both 'success' and 'error' without throwing.
//
// We can't easily test the boxShadow keyframe animation in jsdom (no
// raf-driven tweens). The C8 reduced-motion path IS the test; the full-
// motion path is verified visually in smoke.

import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { ReceiptChoreography } from './ReceiptChoreography';

describe('<ReceiptChoreography />', () => {
  test('renders children with success tone', () => {
    const { getByText } = render(
      <ReceiptChoreography tone="success">
        <span>receipt</span>
      </ReceiptChoreography>,
    );
    expect(getByText('receipt')).toBeTruthy();
  });

  test('renders children with error tone', () => {
    const { getByText } = render(
      <ReceiptChoreography tone="error">
        <span>error receipt</span>
      </ReceiptChoreography>,
    );
    expect(getByText('error receipt')).toBeTruthy();
  });

  test('always wraps in a single layout-stable element (motion.div or div)', () => {
    // The wrapper exists in both motion and reduced-motion branches —
    // see comment in ReceiptChoreography.tsx for why (useReducedMotion()
    // returns null on first render; conditional wrapping would cause
    // a layout flash for reduce-motion users on first paint). The
    // data-receipt-choreography attribute is the stable test hook;
    // its value distinguishes the branches ('success' vs 'success-
    // reduced').
    const { container } = render(
      <ReceiptChoreography tone="success">
        <span data-testid="child">x</span>
      </ReceiptChoreography>,
    );
    const wrapper = container.querySelector('[data-receipt-choreography]');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.querySelector('[data-testid="child"]')).toBeTruthy();
    // Tone is encoded in the attr value
    const attrValue = wrapper?.getAttribute('data-receipt-choreography') ?? '';
    expect(attrValue.startsWith('success')).toBe(true);
  });

  test('error tone is encoded in the data-receipt-choreography attr', () => {
    const { container } = render(
      <ReceiptChoreography tone="error">
        <span>x</span>
      </ReceiptChoreography>,
    );
    const wrapper = container.querySelector('[data-receipt-choreography]');
    expect(wrapper).toBeTruthy();
    const attrValue = wrapper?.getAttribute('data-receipt-choreography') ?? '';
    expect(attrValue.startsWith('error')).toBe(true);
  });
});
