/**
 * Font loaders — Audric Design System v1.2 typography stack.
 *
 * Ported from `apps/web/app/fonts.ts` (S.204+, v0.7c Phase 6.7 polish).
 * Variables are consumed by `globals.css` via:
 *   --font-serif = --font-ny-display, --font-ny-large, --font-ny-medium, ...
 *   --font-sans  = --font-geist-sans, ...
 *   --font-mono  = --font-departure-mono, --font-geist-mono, ...
 *
 * OTF assets live in `app/fonts/` (copied from v1 — same license,
 * same hash). Geist + Geist_Mono come from `next/font/google` and are
 * wired in `app/layout.tsx`; the locals listed here are NewYork (serif
 * stack used for the greeting + brand display surfaces) and
 * DepartureMono (used for nav labels, chips, and small mono caps).
 */

import localFont from "next/font/local";

export const newYorkDisplay = localFont({
  variable: "--font-ny-display",
  display: "swap",
  src: [
    {
      path: "./fonts/NewYorkExtraLarge-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/NewYorkExtraLarge-MediumItalic.otf",
      weight: "500",
      style: "italic",
    },
    {
      path: "./fonts/NewYorkExtraLarge-Semibold.otf",
      weight: "600",
      style: "normal",
    },
  ],
});

export const newYorkLarge = localFont({
  variable: "--font-ny-large",
  display: "swap",
  src: [
    {
      path: "./fonts/NewYorkLarge-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/NewYorkLarge-Medium.otf",
      weight: "500",
      style: "normal",
    },
  ],
});

export const newYorkMedium = localFont({
  variable: "--font-ny-medium",
  display: "swap",
  src: [
    {
      path: "./fonts/NewYorkMedium-Regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
});

export const departureMono = localFont({
  variable: "--font-departure-mono",
  display: "swap",
  src: [
    {
      path: "./fonts/DepartureMono-Regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
});
