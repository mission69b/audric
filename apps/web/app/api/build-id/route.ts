import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

// `force-dynamic` so this is always evaluated at request time on the
// instance currently serving traffic. With Vercel Skew Protection the
// edge will route an old client's `/api/build-id` request to its
// pinned-old deployment for the protection window — that's intended:
// during the window the client should keep believing its bundle is
// current, so the version-check toast doesn't fire. Once the protection
// window expires, requests reach the new deployment, the IDs differ,
// and the toast prompts the user to refresh on their next idle moment.
export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export function GET() {
  const id =
    env.VERCEL_DEPLOYMENT_ID
    || env.VERCEL_GIT_COMMIT_SHA
    || 'local-dev';
  return NextResponse.json(
    { id },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
