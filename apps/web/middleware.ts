import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// [SIMPLIFICATION DAY 12.5] Dropped /automations + /reports rewrites and the
// /settings/automations redirect. Both panels were retired in S.11; the dashboard
// PanelId union no longer carries them, so the rewrites silently fell through to
// chat. Old bookmarks now hit the standard 404. Other panel rewrites keep
// working as the chat-first dashboard's deep-link surface.
const PANEL_PATHS = new Set([
  '/portfolio',
  '/activity',
  '/pay',
  '/goals',
  '/contacts',
  '/store',
]);

// [SPEC 22.5 — 2026-05-10] App version stamped at module init so every
// request the middleware handles gets the same identifier without a
// per-request env read. Vercel sets these vars on the running instance
// at build time; reading at module load is correct. Falls back to
// 'local-dev' so the comparison on the client is always a no-op in dev.
//
// We do NOT route through `lib/env.ts` here because middleware runs in
// edge runtime where Next.js performs literal-replacement on
// `process.env.X` — `lib/env.ts`'s Proxy + Zod validation gate would
// add ~50KB to the middleware bundle. Direct reads are the canonical
// pattern for middleware (per Vercel docs); the Zod env gate is
// enforced for app code, not middleware.
const APP_VERSION =
  // eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: middleware runs in edge runtime; lib/env.ts proxy adds ~50KB.
  process.env.VERCEL_DEPLOYMENT_ID ||
  // eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: middleware runs in edge runtime; lib/env.ts proxy adds ~50KB.
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'local-dev';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PANEL_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/new';
    url.searchParams.set('panel', pathname.slice(1));
    const response = NextResponse.rewrite(url);
    response.headers.set('X-App-Version', APP_VERSION);
    return response;
  }

  // [SPEC 22.5 — 2026-05-10] Stamp every API response with the running
  // instance's deployment id. Client middleware (`installVersionDrift
  // Handler` in `lib/version-drift-check.ts`) compares this header
  // against the build-time `NEXT_PUBLIC_DEPLOYMENT_ID` baked into the
  // current bundle; on mismatch the tab schedules an auto-reload (1s
  // delay or visibility-change, whichever comes first) so the user
  // gets the new build without a manual refresh. This piggy-backs on
  // EVERY API call instead of waiting for the existing 5-min
  // `useVersionCheck` poll → drift typically detected within seconds
  // of the user's next interaction post-deploy.
  //
  // Static assets and Next chunks are matched separately (excluded
  // below) so we don't waste edge CPU stamping headers on PNGs.
  const response = NextResponse.next();
  response.headers.set('X-App-Version', APP_VERSION);
  return response;
}

export const config = {
  // [SPEC 22.5 — 2026-05-10] Broadened from panel-only to "every
  // route except static assets / Next internals / favicon" so the
  // X-App-Version header rides on every API response the client makes.
  // Previously only the 6 panel paths were matched (rewrite-only); we
  // keep those for the rewrite logic AND add `/api/:path*` to drive
  // version-drift detection. The (?!_next|favicon) negative lookahead
  // pattern is the canonical Next.js "everything except statics"
  // matcher.
  matcher: [
    '/portfolio',
    '/activity',
    '/pay',
    '/goals',
    '/contacts',
    '/store',
    // Every API route — the X-App-Version header lives here.
    '/api/:path*',
  ],
};
