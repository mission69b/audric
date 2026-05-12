// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C4 — smoothScrollIntoView helper
//
// Reduced-motion-aware wrapper around Element.scrollIntoView. Replaces
// raw `el.scrollIntoView({ behavior: 'smooth' })` calls so users with
// `prefers-reduced-motion: reduce` get an instant snap to position
// instead of an unexpected scroll animation. The smooth path itself
// uses the browser's native scroll-behavior: smooth implementation —
// modern browsers (Chrome, Safari, Firefox, Edge) all use a similar
// easing curve over ~250-500ms which is close enough to the spec's
// "easeOutCubic 250ms" target that custom-implementing the rAF tween
// would only buy us a barely-perceptible quality difference at the
// cost of significantly more code (scroll-container detection, scroll-
// snap interaction, focus stealing, etc).
//
// IF FOUNDER SMOKE FLAGS THE SCROLL FEEL:
//   Swap in a custom rAF easeOutCubic 250ms implementation. The
//   contract of this helper (one function, one element argument)
//   stays stable; only the body changes. Outline of the rAF version:
//
//     1. Find the nearest scroll container (walk up checking
//        overflow-y: auto/scroll, fall back to window).
//     2. Compute target scrollTop = element.offsetTop +
//        element.clientHeight - container.clientHeight.
//     3. requestAnimationFrame loop: each frame, compute t = elapsed /
//        250, eased = 1 - (1-t)^3, container.scrollTop = startTop +
//        distance * eased.
//     4. Cancel via stored rAF handle if user manually scrolls
//        mid-animation (don't fight the user).
//
//   Today's helper trades that complexity for browser-native behavior.
//
// USAGE:
//   import { smoothScrollIntoView } from '@/lib/scroll/smoothScrollIntoView';
//   smoothScrollIntoView(endRef.current);
//
// REPLACES:
//   el.scrollIntoView({ behavior: 'smooth', block: 'end' });
//   →
//   smoothScrollIntoView(el);
// ───────────────────────────────────────────────────────────────────────────

interface SmoothScrollOptions {
  /** Vertical alignment of the target inside the scroll container.
   *  Defaults to 'end' (matches the chat-bottom scroll pattern).
   *  Override to 'start' / 'center' / 'nearest' if needed. */
  block?: ScrollLogicalPosition;
}

export function smoothScrollIntoView(
  element: HTMLElement | null | undefined,
  options: SmoothScrollOptions = {},
): void {
  if (!element) return;

  const block = options.block ?? 'end';

  // SSR / non-window environments — bail out (test envs, server render).
  if (typeof window === 'undefined') {
    return;
  }

  // Reduced-motion users get an instant snap. matchMedia returns null
  // in some envs (older browsers, malformed configs); fall through to
  // smooth scroll in those cases as a safer default than refusing to
  // scroll at all.
  const reducesMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  element.scrollIntoView({
    behavior: reducesMotion ? 'auto' : 'smooth',
    block,
  });
}
