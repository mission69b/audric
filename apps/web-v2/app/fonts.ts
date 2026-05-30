/**
 * Font loaders — Audric Design System v1.2 typography stack.
 *
 * Ported from `apps/web/app/fonts.ts` (S.204+, v0.7c Phase 6.7 polish).
 *
 * [R6.4 — 2026-05-30] New York stripped — it was a v1 Agentic-DS
 * leftover, NOT part of the Geist DS (where display = Geist, per
 * `t2000-AFI/assets/colors_and_type.css`). The app is now pure
 * Geist + Geist Mono (from `next/font/google`, wired in
 * `app/layout.tsx`). DepartureMono is kept as a back-compat local
 * loader; the app UI no longer renders it.
 */

import localFont from "next/font/local";

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
