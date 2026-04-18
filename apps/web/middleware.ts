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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PANEL_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/new';
    url.searchParams.set('panel', pathname.slice(1));
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/portfolio',
    '/activity',
    '/pay',
    '/goals',
    '/contacts',
    '/store',
  ],
};
