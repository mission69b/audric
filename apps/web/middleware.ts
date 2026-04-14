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

  if (PANEL_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/new';
    url.searchParams.set('panel', pathname.slice(1));
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/portfolio', '/activity', '/pay', '/automations', '/goals', '/reports', '/contacts', '/store'],
};
