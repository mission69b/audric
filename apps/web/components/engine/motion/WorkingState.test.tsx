// SPEC 23C C10 — WorkingState primitive tests
//
// Asserts:
//   1. Renders the default "WORKING" label and the first phase.
//   2. Custom label overrides the default.
//   3. Tool-name lookup picks the right phase set for known tools.
//   4. Unknown tool name falls back to the generic phase set.
//   5. `phases` prop fully overrides the lookup.
//   6. Phase transitions fire on the configured timeouts (fake timers).
//   7. Wrapper accepts className.
//   8. Mounts without crashing.
//
// Skipped (consistent with ApprovingIndicator/MountAnimate/TypingDots):
//   - The reduce-motion branch — framer-motion's useReducedMotion
//     subscribes via a path that doesn't settle in jsdom within
//     React's effect cycle. The reduce-motion code path is verified
//     by inspection + founder smoke.

import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { WorkingState, FALLBACK_PHASES, resolvePhases } from './WorkingState';

describe('<WorkingState />', () => {
  test('renders the default "WORKING" label', () => {
    const { getByText } = render(<WorkingState />);
    expect(getByText('WORKING')).toBeTruthy();
  });

  test('renders the first phase from the fallback when no toolName is set', () => {
    const { getByText } = render(<WorkingState />);
    expect(getByText(FALLBACK_PHASES[0])).toBeTruthy();
  });

  test('overrides the label with the `label` prop', () => {
    const { getByText, queryByText } = render(<WorkingState label="PROCESSING" />);
    expect(getByText('PROCESSING')).toBeTruthy();
    expect(queryByText('WORKING')).toBeNull();
  });

  test('uses the pay_api phase set when toolName="pay_api"', () => {
    const { getByText } = render(<WorkingState toolName="pay_api" />);
    expect(getByText('Confirming on-chain…')).toBeTruthy();
  });

  test('falls back to FALLBACK_PHASES when toolName is unknown', () => {
    const { getByText } = render(<WorkingState toolName="some_made_up_tool" />);
    expect(getByText(FALLBACK_PHASES[0])).toBeTruthy();
  });

  test('uses the explicit `phases` prop over the toolName lookup', () => {
    const { getByText, queryByText } = render(
      <WorkingState toolName="pay_api" phases={['Custom phase 1', 'Custom phase 2']} />,
    );
    expect(getByText('Custom phase 1')).toBeTruthy();
    expect(queryByText('Confirming on-chain…')).toBeNull();
  });

  test('passes className to the wrapping element', () => {
    const { container } = render(<WorkingState className="text-center" />);
    expect(container.firstElementChild?.className).toContain('text-center');
  });

  test('does not crash on mount', () => {
    expect(() => render(<WorkingState />)).not.toThrow();
  });
});

describe('<WorkingState /> phase progression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('advances to phase 1 after the first transition (fake timers)', () => {
    const { getByText, queryByText } = render(
      <WorkingState
        toolName="pay_api"
        transitionsMs={[100, 200]}
      />,
    );

    expect(getByText('Confirming on-chain…')).toBeTruthy();
    expect(queryByText('Working with vendor…')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(getByText('Working with vendor…')).toBeTruthy();
  });

  test('advances to phase 2 after the second transition', () => {
    const { getByText } = render(
      <WorkingState
        toolName="pay_api"
        transitionsMs={[50, 100]}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(getByText('Almost done…')).toBeTruthy();
  });

  test('clamps at the final phase if more time elapses', () => {
    const { getByText } = render(
      <WorkingState
        toolName="pay_api"
        transitionsMs={[10, 20]}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(getByText('Almost done…')).toBeTruthy();
  });
});

describe('resolvePhases()', () => {
  test('returns FALLBACK_PHASES for undefined toolName', () => {
    expect(resolvePhases(undefined)).toEqual(FALLBACK_PHASES);
  });

  test('returns FALLBACK_PHASES for unknown toolName', () => {
    expect(resolvePhases('definitely_not_a_real_tool')).toEqual(FALLBACK_PHASES);
  });

  test('returns the right phase set for swap_execute', () => {
    const out = resolvePhases('swap_execute');
    expect(out[1]).toBe('Routing through DEXes…');
  });

  test('honors the override array when non-empty', () => {
    const out = resolvePhases('pay_api', ['x', 'y']);
    expect(out).toEqual(['x', 'y']);
  });

  test('falls back to the toolName lookup when override is empty', () => {
    const out = resolvePhases('pay_api', []);
    expect(out[0]).toBe('Confirming on-chain…');
  });
});
