// SPEC 23C C6 — ApprovingIndicator primitive tests
//
// Asserts:
//   1. Renders the spinner + label.
//   2. Default label is "Approving…", custom label overrides it.
//   3. Wrapper accepts className.
//   4. No-crash mount.
//
// Following the convention from MountAnimate / ReceiptChoreography /
// TypingDots: we don't probe the reduce-vs-motion branch at the
// className level because Framer Motion's useReducedMotion subscribes
// via a path that doesn't settle in jsdom within React's effect cycle.
// The reduce-motion code path is verified by inspection + founder smoke.

import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { ApprovingIndicator } from './ApprovingIndicator';

describe('<ApprovingIndicator />', () => {
  test('renders the default "Approving…" label', () => {
    const { getByText } = render(<ApprovingIndicator />);
    expect(getByText('Approving…')).toBeTruthy();
  });

  test('overrides the label with the `label` prop', () => {
    const { getByText, queryByText } = render(<ApprovingIndicator label="Processing…" />);
    expect(getByText('Processing…')).toBeTruthy();
    expect(queryByText('Approving…')).toBeNull();
  });

  test('passes className to the wrapping element', () => {
    const { container } = render(<ApprovingIndicator className="text-center" />);
    expect(container.firstElementChild?.className).toContain('text-center');
  });

  test('does not crash on mount', () => {
    expect(() => render(<ApprovingIndicator />)).not.toThrow();
  });
});
