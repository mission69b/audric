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
 * Adding a route:
 *   - Static path with no params  →  `PUBLIC_PATHS`
 *   - Dynamic path (`/foo/[slug]`) →  `PUBLIC_PREFIXES` (include the
 *     trailing slash so `/foo` itself stays themable if needed)
 */

export const PUBLIC_PATHS: readonly string[] = [
  '/',           // marketing homepage
  '/privacy',    // legal
  '/terms',      // legal
  '/disclaimer', // legal
  '/security',   // legal
  '/verify',     // post-auth landing (still pre-app)
];

export const PUBLIC_PREFIXES: readonly string[] = [
  '/pay/',     // /pay/[slug] — recipient-facing payment receipt (note: `/pay` itself, the create-link form, is themed)
  '/invoice/', // /invoice/[slug] — legacy redirect target to /pay/[slug]
  '/auth/',    // any auth callback / handoff routes
];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}
