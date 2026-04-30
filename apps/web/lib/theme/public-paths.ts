/**
 * Public/marketing routes that must NEVER receive `data-theme="dark"`.
 *
 * Two lists, both consumed by:
 *   - the inline anti-flash script in `app/layout.tsx` (stringified
 *     into the <head> via `getThemeScript()`)
 *   - the runtime `ThemeProvider` (re-evaluates on every navigation
 *     to add or strip the attribute)
 *
 * Single source of truth — keep both call sites pointing here so the
 * pre-paint and post-hydration logic can never disagree.
 *
 * Rule of thumb (Phase 6 → revised post-launch):
 *   LIGHT-ONLY = curated brand surfaces a signed-out visitor lands on:
 *     marketing homepage, legal docs, product info pages. Typography +
 *     hero compositions were designed against a white canvas; force-light
 *     keeps the marketing pitch reading the way it was approved.
 *
 *   THEMED = the authenticated app shell (`/new`, `/chat/[sessionId]`,
 *     `/settings`) PLUS two utility/handoff surfaces that should
 *     follow the OS:
 *       - `/auth/callback` (3–5s zkLogin "Signing you in…" screen —
 *         user came from clicking Sign in with Google so we already
 *         know they're an Audric user mid-flow; flashing them white
 *         in a dark-OS browser is jarring)
 *       - `/pay/[slug]` (recipient-facing receipt — recipient may not be
 *         an Audric user, but they DID set their OS to dark/light, and a
 *         hard-light pay link in a dark browser is a poor first
 *         impression). Recipients with no Audric localStorage default to
 *         `theme: 'system'`, so the page mirrors their OS automatically.
 *
 * Adding a route:
 *   - Static path with no params  →  `PUBLIC_PATHS`
 *   - Dynamic path (`/foo/[slug]`) →  `PUBLIC_PREFIXES` (include the
 *     trailing slash so `/foo` itself stays themable if needed)
 */

export const PUBLIC_PATHS: readonly string[] = [
  // Marketing
  '/',           // homepage
  '/litepaper',  // investor litepaper — light-only brand surface
  // Legal
  '/privacy',
  '/terms',
  '/disclaimer',
  '/security',
  // NOTE: `/pay/` and `/auth/` were intentionally MOVED out of
  // PUBLIC_PREFIXES below — both are utility/handoff surfaces that
  // follow the OS / stored theme. See module header for rationale.
  // (Pre-PR-B2 the `/verify` route was here too; the entire Resend
  // verify-link flow has since been deleted.)
  // (S.51 — removed `/savings` `/credit` `/swap` `/send` `/receive`:
  // these were ProductPage subpages from the pre-S.18 6-operation
  // taxonomy. They contradicted the canonical 5-product model, were
  // orphaned from the homepage footer, and accumulated stale token /
  // APY claims. Homepage now markets Passport / Intelligence /
  // Finance / Pay / Store as in-page anchors.)
];

export const PUBLIC_PREFIXES: readonly string[] = [
  '/invoice/', // /invoice/[slug] — legacy redirect target to /pay/[slug]
  // NOTE: `/pay/` and `/auth/` MOVED out — both are utility/handoff
  // surfaces that follow the OS / stored theme. See module header for
  // rationale.
];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}
