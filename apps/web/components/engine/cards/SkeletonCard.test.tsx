// SPEC 23C C2 — SkeletonCard primitive tests
//
// Verifies (a) every variant renders without throwing, (b) the role +
// aria-label + aria-busy attrs are wired so screen readers announce the
// loading state, (c) the data-skeleton attr exposes the variant for
// integration assertions, (d) the pulse class is applied (proxy: a
// `.animate-pulse` element exists), (e) `motion-reduce:animate-none`
// modifier is present so reduced-motion users see no shimmer.

import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonCard, type SkeletonVariant } from './SkeletonCard';

const VARIANTS: SkeletonVariant[] = [
  'compact',
  'wide',
  'list',
  'chip',
  'media-image',
  'media-audio',
  'receipt',
];

describe('<SkeletonCard />', () => {
  test.each(VARIANTS)('renders %s variant without throwing', (variant) => {
    const { container } = render(<SkeletonCard variant={variant} />);
    expect(container.querySelector(`[data-skeleton="${variant}"]`)).toBeTruthy();
  });

  test('exposes role="status" with aria-busy and aria-live for screen readers', () => {
    render(<SkeletonCard variant="compact" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  test('uses default aria-label when none provided', () => {
    render(<SkeletonCard variant="compact" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  test('respects custom aria-label', () => {
    render(<SkeletonCard variant="wide" ariaLabel="Loading balance check" />);
    expect(screen.getByLabelText('Loading balance check')).toBeTruthy();
  });

  test.each(VARIANTS)(
    '%s variant applies animate-pulse with motion-reduce:animate-none',
    (variant) => {
      const { container } = render(<SkeletonCard variant={variant} />);
      const pulseBars = container.querySelectorAll('.animate-pulse');
      expect(pulseBars.length).toBeGreaterThan(0);
      pulseBars.forEach((bar) => {
        expect(bar.className).toContain('motion-reduce:animate-none');
      });
    },
  );

  test('chip variant is the smallest (single-line affordance)', () => {
    // Sanity check: chip should have fewer pulse bars than wide.
    const { container: chipContainer } = render(<SkeletonCard variant="chip" />);
    const { container: wideContainer } = render(<SkeletonCard variant="wide" />);
    const chipBars = chipContainer.querySelectorAll('.animate-pulse').length;
    const wideBars = wideContainer.querySelectorAll('.animate-pulse').length;
    expect(chipBars).toBeLessThan(wideBars);
  });

  test('media-image variant reserves an image-aspect placeholder', () => {
    const { container } = render(<SkeletonCard variant="media-image" />);
    const aspect = container.querySelector('.aspect-square');
    expect(aspect).toBeTruthy();
  });
});
