const SIZES = {
  sm: 'h-4 w-4 border-[1.5px]',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
} as const;

interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
}

// [SPEC 23C C8] `motion-reduce:animate-none` honors prefers-reduced-
// motion. Static circle is still recognisable as a loading state via:
//   - Identical visual position to the animated spinner
//   - role="status" + aria-label="Loading" (assistive tech announces it)
//   - The border-t-fg-primary stripe stays visible (a circle with one
//     thicker arc reads as "spinner shape, paused")
// Per WCAG 2.3.3, removing the spin avoids vestibular triggers for the
// (very small) subset of users with motion-sensitivity disorders.
// Production users in this group accept "loading without spin" as a
// valid affordance.
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-border-subtle border-t-fg-primary motion-reduce:animate-none animate-[spin-arc_0.8s_linear_infinite] ${SIZES[size]} ${className}`}
    />
  );
}
