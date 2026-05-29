/**
 * Spinner — single source of truth for loading affordances across
 * LoadingScreen, ThinkingState, AuthGuard, prompt-input, and any
 * other "work in progress" surface.
 *
 * Ported from `apps/web/components/ui/Spinner.tsx` (S.204+ Phase 2
 * splash port). Replaces the chatbot template's Loader2Icon wrapper
 * with v1's monochrome arc-stroke (border-t-foreground spinning
 * over a border-border ring). Uses the `spin-arc` keyframe
 * (defined in `app/globals.css`) so timing matches v1 (0.8s linear
 * infinite) — slightly faster than Tailwind's default `animate-spin`
 * (1s).
 *
 * API change vs the chatbot template Spinner: the old version took
 * arbitrary svg props and used 16px Loader2Icon by default. New
 * version uses a typed `size` enum ('sm' | 'md' | 'lg'). Default
 * stays at 'sm' (16px) so bare `<Spinner />` callers don't visually
 * regress. Existing call sites checked at port time: auth-guard.tsx,
 * prompt-input.tsx (both use bare `<Spinner />`).
 *
 * Accessibility: `role="status"` + `aria-label="Loading"` so
 * screen-readers announce it. `motion-reduce:animate-none` honors
 * prefers-reduced-motion (WCAG 2.3.3) — the static circle still
 * reads as a spinner shape since the border-t stripe stays visible.
 */

const SIZES = {
  sm: "h-4 w-4 border-[1.5px]",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
} as const;

interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
}

export function Spinner({ size = "sm", className = "" }: SpinnerProps) {
  return (
    <span
      aria-label="Loading"
      className={`inline-block rounded-full border-border border-t-foreground motion-reduce:animate-none animate-[spin-arc_0.8s_linear_infinite] ${SIZES[size]} ${className}`}
      role="status"
    />
  );
}
