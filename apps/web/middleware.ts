import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PANEL_PATHS = new Set([
  '/portfolio',
  '/activity',
  '/pay',
  '/automations',
  '/goals',
  '/reports',
  '/contacts',
  '/store',
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Wave C.4 — `/settings/automations` was renamed to the Copilot tab.
  // 308 (permanent + preserves method) so old emails / external links land in
  // the right place without breaking POSTs (none expected, but cheap insurance).
  if (pathname === '/settings/automations') {
    const url = request.nextUrl.clone();
    url.pathname = '/settings';
    url.searchParams.set('section', 'copilot');
    return NextResponse.redirect(url, 308);
  }

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
    '/automations',
    '/goals',
    '/reports',
    '/contacts',
    '/store',
    '/settings/automations',
  ],
};
