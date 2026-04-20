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
 * Rule of thumb (decided in Phase 6):
 *   PUBLIC = anything a signed-out visitor can land on
 *   (marketing, legal, product info pages, auth handoff, public
 *   pay receipt). All public surfaces stay LIGHT — Audric's brand
 *   face to the world is light-only.
 *
 *   THEMED = the authenticated app shell (`/new`, `/chat/[sessionId]`,
 *   `/settings`). Only here does the user's `light / dark / system`
 *   choice apply.
 *
 * Adding a route:
 *   - Static path with no params  →  `PUBLIC_PATHS`
 *   - Dynamic path (`/foo/[slug]`) →  `PUBLIC_PREFIXES` (include the
 *     trailing slash so `/foo` itself stays themable if needed)
 */

export const PUBLIC_PATHS: readonly string[] = [
  // Marketing
  '/',           // homepage
  // Legal
  '/privacy',
  '/terms',
  '/disclaimer',
  '/security',
  // Product info pages (pre-auth marketing-style explainers — middleware
  // does NOT rewrite these like it does /pay /goals etc., so they render
  // their own ProductPage shell to signed-out visitors)
  '/savings',
  '/credit',
  '/swap',
  '/send',
  '/receive',
  // Auth handoff (post-OAuth, pre-app)
  '/verify',
];

export const PUBLIC_PREFIXES: readonly string[] = [
  '/pay/',     // /pay/[slug] — recipient-facing payment receipt
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
