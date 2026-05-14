import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

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

// [SPEC 30 Phase 1A.2 — 2026-05-14] Edge-runtime JWT verification (PERMISSIVE).
//
// Behaviour: when an `x-zklogin-jwt` header IS present, verify its
// signature against Google's JWKS. On verify-success, stamp the
// downstream request with `x-auth-verified-sub: <jwt.sub>` so route
// handlers can trust the JWT is real without re-running the signature
// check. On verify-FAILURE, reject with HTTP 401 (we don't allow
// invalid JWTs to flow through — that's the structural fix vs. the
// pre-Phase-1A behaviour where `decodeJwt` accepted any base64
// payload).
//
// **PERMISSIVE rationale (SPEC 30 Phase 1A.2 trade-off):** when the
// JWT header is ABSENT, the middleware passes the request through
// instead of rejecting. ~60 client fetch sites currently send no JWT
// at all (portfolio canvas, activity feed, analytics dashboards,
// settings memory section, etc.); rejecting those would require a
// monorepo-wide migration to a centralised `authFetch` wrapper, which
// is Phase 1A.5's scope. Phase 1A's hot-patch lane closes the
// reporter's demonstrated exploit (address-swap on JWT-bearing
// requests) via `assertOwns` per-route — middleware here proves the
// JWT is real, per-route bindings prove the JWT identity owns the
// resource. Together they close the demonstrated IDOR class.
//
// **Phase 1A.5 (own SPEC at founder triage):** add `authFetch` wrapper,
// migrate the ~50 remaining fetch sites, tighten this middleware to
// require JWT on all non-allow-listed routes. That diff is too large
// to bundle inside Phase 1A's 3-4d budget without regression risk.
//
// **Routes with their own auth gate (skipped here, not even
// permissive-checked):**
//   - /api/internal/**     (x-internal-key, internal cron callers)
//   - /api/cron/**         (CRON_SECRET, Vercel cron)
//   - /api/services/complete (sponsor-tx execute leg, sig-bound)
//   - /api/services/retry    (sponsor-tx retry leg, sig-bound)
//   - /api/transactions/execute (sponsor-tx execute, sig-bound)

const SEPARATE_AUTH_PREFIXES = [
  '/api/internal/',
  '/api/cron/',
  '/api/services/complete',
  '/api/services/retry',
  '/api/transactions/execute',
];

// `jose` JWKS handle (lazy + module-scoped). Edge runtime uses Web
// Crypto under the hood. Bundle cost is ~80KB but it's used once per
// middleware cold-start, then warm in-memory thereafter.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
});

// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: middleware runs in edge runtime; lib/env.ts proxy adds ~50KB.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function hasSeparateAuth(pathname: string): boolean {
  return SEPARATE_AUTH_PREFIXES.some((p) => pathname.startsWith(p));
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'X-App-Version': APP_VERSION } },
  );
}

async function verifyJwtSignature(jwt: string): Promise<{ sub: string } | null> {
  if (!GOOGLE_CLIENT_ID) {
    // Fail closed in production. In local dev where the var is unset,
    // returning null makes middleware reject the request — which is the
    // correct behavior even in dev (the bug is in env config, not the
    // request).
    return null;
  }
  try {
    const { payload } = await jwtVerify(jwt, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: GOOGLE_CLIENT_ID,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PANEL_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/new';
    url.searchParams.set('panel', pathname.slice(1));
    const response = NextResponse.rewrite(url);
    response.headers.set('X-App-Version', APP_VERSION);
    return response;
  }

  // [SPEC 30 Phase 1A.2 — 2026-05-14] JWT enforcement gate (PERMISSIVE).
  // Only API paths flow through this branch; the matcher excludes
  // statics so we don't waste edge CPU on PNGs. Routes with their own
  // auth (internal-key, cron-secret, sig-bound execute) skip entirely.
  if (pathname.startsWith('/api/') && !hasSeparateAuth(pathname)) {
    const jwt = request.headers.get('x-zklogin-jwt');
    if (jwt) {
      const verified = await verifyJwtSignature(jwt);
      if (!verified) {
        // JWT WAS sent but signature failed — reject. Pre-Phase-1A,
        // `decodeJwt` accepted any base64 payload as valid. Now any
        // route that opts into JWT auth gets free signature verification.
        return jsonError(401, 'Invalid authentication token');
      }
      // Stamp the verified `sub` so route handlers can trust the JWT
      // is real without re-running the signature check. Routes that
      // take an `address` parameter MUST still call `assertOwns` to
      // enforce the address binding — middleware only proves the JWT
      // itself is real.
      const response = NextResponse.next({
        request: {
          headers: new Headers({
            ...Object.fromEntries(request.headers),
            'x-auth-verified-sub': verified.sub,
          }),
        },
      });
      response.headers.set('X-App-Version', APP_VERSION);
      return response;
    }
    // No JWT header → fall through to default path (Phase 1A.5 will
    // tighten this to mandate JWT on all non-allow-listed routes).
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
    // Every API route — the X-App-Version header lives here AND
    // SPEC 30 Phase 1A.2 JWT enforcement runs here.
    '/api/:path*',
  ],
};
