// SPEC 23C C4 — smoothScrollIntoView helper tests
//
// Asserts:
//   1. No-ops on null / undefined element (defensive against ref.current
//      being null on first render).
//   2. Calls element.scrollIntoView with the right behavior based on
//      matchMedia(prefers-reduced-motion: reduce).
//   3. Default block is 'end'; custom block prop overrides.
//
// In tests, vitest.setup.ts mocks matchMedia to return matches=true for
// the prefers-reduced-motion query, so the reduce path is taken — we
// verify behavior: 'auto' is passed.

import { describe, expect, test, vi } from 'vitest';
import { smoothScrollIntoView } from './smoothScrollIntoView';

describe('smoothScrollIntoView', () => {
  test('no-ops on null element', () => {
    // No throw, no error, no scroll attempt
    expect(() => smoothScrollIntoView(null)).not.toThrow();
    expect(() => smoothScrollIntoView(undefined)).not.toThrow();
  });

  test('passes behavior: "auto" when prefers-reduced-motion is set (test default)', () => {
    const scrollSpy = vi.fn();
    const fakeElement = {
      scrollIntoView: scrollSpy,
    } as unknown as HTMLElement;
    smoothScrollIntoView(fakeElement);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'end',
    });
  });

  test('respects custom block option', () => {
    const scrollSpy = vi.fn();
    const fakeElement = {
      scrollIntoView: scrollSpy,
    } as unknown as HTMLElement;
    smoothScrollIntoView(fakeElement, { block: 'nearest' });
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
    });
  });

  test('passes behavior: "smooth" when reduce-motion is NOT set', () => {
    // Override matchMedia for this test only — return matches=false to
    // simulate a user without prefers-reduced-motion.
    const original = window.matchMedia;
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = (
      query: string,
    ) => ({
      matches: !query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });

    try {
      const scrollSpy = vi.fn();
      const fakeElement = {
        scrollIntoView: scrollSpy,
      } as unknown as HTMLElement;
      smoothScrollIntoView(fakeElement);
      expect(scrollSpy).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'end',
      });
    } finally {
      (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = original;
    }
  });
});
