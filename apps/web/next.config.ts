import type { NextConfig } from 'next';

// Resolve the deployment id once and reuse it for both the build-time
// `deploymentId` (server/edge skew routing) and the
// `NEXT_PUBLIC_DEPLOYMENT_ID` env var (baked into the client bundle so
// `useVersionCheck` can compare what the browser shipped with against
// what `/api/build-id` reports as live).
const RESOLVED_DEPLOYMENT_ID =
  process.env.VERCEL_DEPLOYMENT_ID
  || process.env.VERCEL_GIT_COMMIT_SHA
  || 'local-dev';

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Permissions-Policy',
    // `microphone=(self)` allows the mic API for our own origin (so the
    // voice mode mic button works) while still denying every embedded
    // third-party iframe. `microphone=()` would block self too — that
    // bug shipped briefly and made `getUserMedia` reject silently with
    // NotAllowedError before the browser even prompted the user.
    value: 'camera=(), microphone=(self), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      // `media-src 'self' blob: data:` covers two distinct flows:
      //   - `blob:` — voice mode HTMLAudioElement plays an in-memory
      //     Blob URL streamed from ElevenLabs (the original reason
      //     `blob:` was added).
      //   - `data:` — MPP `pay_api` audio results (OpenAI TTS today,
      //     other vendors later) are returned by `/api/services/
      //     complete` as `data:audio/mpeg;base64,...` URIs; the
      //     TrackPlayer card binds them to `<audio src=...>`. Without
      //     `data:` here, CSP rejects the source with a console
      //     warning ("Loading media from 'data:audio/mpeg;...'
      //     violates CSP directive media-src 'self' blob:") and
      //     `play()` throws NotSupportedError ("The element has no
      //     supported sources"). Founder smoke 2026-05-12 surfaced
      //     this — looked like a decode failure, was actually a CSP
      //     block.
      //
      // Future improvement: convert base64 → Blob → URL.create­Object­URL
      // on the client so we only need `blob:`. Saves ~30% memory
      // (no base64 string + decoded Blob both held), faster decode,
      // and keeps the CSP tighter. Tracked in the HANDOFF as a
      // followup; the data: allow is the immediate unblock.
      "media-src 'self' blob: data:",
      "connect-src 'self' https://fullnode.mainnet.sui.io:443 https://fullnode.testnet.sui.io:443 https://api.enoki.mystenlabs.com https://prover.mystenlabs.com https://prover-dev.mystenlabs.com https://accounts.google.com https://*.googleapis.com https://*.upstash.io https://open-api.naviprotocol.io https://mpp.t2000.ai https://*.mvr.mystenlabs.com",
      "frame-src https://accounts.google.com",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
    ].join('; '),
  },
];

// ---------------------------------------------------------------------------
// v0.7c Phase 6 Session 5 — Vercel rewrites flip (founder Option A lock,
// 2026-05-20).
//
// apps/web is the public-facing audric.ai domain. Each rewrite below
// shifts one surface from apps/web → web-v2 transparently to the user
// (same URL, different origin server-side). Rewrites land BEFORE the
// chat-shell cutover (Session 6) so the supporting surfaces (Pay /
// Store / Settings / Internal-API) flip first; chat (`/new`,
// `/chat/:path*`, `/api/audric-chat`, `/api/transactions/*`) flips in
// Session 6 as the founder-owned ops step.
//
// Rollback granularity is per-rewrite: comment out any block + redeploy
// to fall back to apps/web for that path alone. See
// `spec/runbooks/RUNBOOK_v07c_phase_6_cutover.md` §8.2.
//
// Memory note: `/settings/memory` IS rewritten to web-v2 — web-v2
// renders v0.7d MemWal-backed memory UI. Legacy `/api/user/memories`
// route on apps/web was removed in v0.7d Block A (S.221); the dead
// MemorySection.tsx UI was removed in v0.7e Phase 1A.4 (S.238).
//
// `/auth/callback` is INTENTIONALLY excluded from rewrites — both apps
// host their own callback page. Sign-ins originating from apps/web
// resolve on apps/web; sign-ins originating from web-v2 resolve on
// web-v2. The chat cutover (Session 6) will route post-auth users to
// `/new` which IS rewritten to web-v2.
// ---------------------------------------------------------------------------
const WEB_V2 = 'https://audric-web-v2.vercel.app';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      // ── Pay (Session 4 ship) ────────────────────────────────────────
      { source: '/pay/:slug', destination: `${WEB_V2}/pay/:slug` },
      { source: '/api/payments/:slug', destination: `${WEB_V2}/api/payments/:slug` },
      { source: '/api/payments/:slug/verify', destination: `${WEB_V2}/api/payments/:slug/verify` },
      // Legacy invoice slug — redirect-equivalent via rewrite so the
      // 10-LoC apps/web/app/invoice/[slug]/page.tsx can delete with the
      // chat shell in Session 9d. Web-v2's /pay/[slug] renders the
      // invoice union case (line items + due date) inline.
      { source: '/invoice/:slug', destination: `${WEB_V2}/pay/:slug` },

      // ── Settings (Session 2 ship) ───────────────────────────────────
      // Catch-all routes /settings, /settings/passport, /settings/safety,
      // /settings/contacts, AND /settings/memory (signpost card — S.188).
      { source: '/settings', destination: `${WEB_V2}/settings` },
      { source: '/settings/:path*', destination: `${WEB_V2}/settings/:path*` },

      // ── Internal-API (Session 4.5 ship) ─────────────────────────────
      // The 6 routes engine tools call via AUDRIC_INTERNAL_API_URL. After
      // the Vercel env-var flip (manual, founder-owned), engine tools
      // bound to audric.ai paths route to web-v2 directly; these
      // rewrites belt-and-braces the same flip for any caller that
      // hard-codes audric.ai (e.g. the manual operator curl in
      // `RUNBOOK_v07c_phase_6_cutover.md` §5.4).
      { source: '/api/internal/payments', destination: `${WEB_V2}/api/internal/payments` },
      { source: '/api/portfolio', destination: `${WEB_V2}/api/portfolio` },
      { source: '/api/analytics/portfolio-history', destination: `${WEB_V2}/api/analytics/portfolio-history` },
      { source: '/api/analytics/yield-summary', destination: `${WEB_V2}/api/analytics/yield-summary` },
      { source: '/api/analytics/activity-summary', destination: `${WEB_V2}/api/analytics/activity-summary` },
      { source: '/api/analytics/spending', destination: `${WEB_V2}/api/analytics/spending` },

      // ── Audric Store (Session 3 ship) ───────────────────────────────
      // Catch-all `/[username]` with negative lookahead — every other
      // top-level URL segment that resolves to a NON-username surface
      // MUST appear in the exclusion list. Order doesn't matter inside
      // the lookahead; the leading `(?!...)` rejects the match before
      // the trailing `.*` consumes anything.
      //
      // Exclusions (in alphabetical groups):
      //   • Framework / static: _next, api, favicon.ico, icon, opengraph-image, robots.txt, sitemap
      //   • Apps/web KEEP-IN-WEB: admin (internal), auth, disclaimer,
      //     litepaper, privacy, security, terms
      //   • Apps/web sources that have their own rewrites above:
      //     chat, invoice, new, pay, settings
      //
      // If you add a new top-level surface to apps/web, append its
      // segment here BEFORE shipping.
      {
        source: '/:username((?!_next|admin|api|auth|chat|disclaimer|favicon\\.ico|icon|invoice|litepaper|new|opengraph-image|pay|privacy|robots\\.txt|security|settings|sitemap|terms).*)',
        destination: `${WEB_V2}/:username`,
      },
    ];
  },
  // Vercel Skew Protection: pin every framework-managed asset/navigation
  // request to the deployment that served the user's initial HTML so a
  // tab opened against the previous build keeps loading chunks from the
  // previous build instead of 404-ing against the new one (which is what
  // produced the post-deploy flicker users saw before they signed out and
  // back in to force a fresh HTML fetch). Vercel stamps this build-time
  // ID into `routes-manifest.json` and uses it on the edge to route
  // `?dpl=` and `x-deployment-id` requests to the matching deployment.
  // Falls back to `VERCEL_GIT_COMMIT_SHA` for prebuilt deploys, and
  // `'local-dev'` for `pnpm dev` (where skew is irrelevant).
  // Skew Protection itself must also be toggled on under Vercel project
  // Settings → Advanced → Skew Protection; this config is the build-side
  // half. See `audric-build-tracker.md` Phase H tail (S.24, 2026-04-27).
  deploymentId: RESOLVED_DEPLOYMENT_ID,
  // Inline the same id into the client bundle so the version-check
  // hook can detect a deploy mismatch (build-time id vs. the id served
  // live by `/api/build-id`). `NEXT_PUBLIC_*` is statically replaced at
  // build time by Next, which is exactly what we want — the value is
  // frozen to the deploy that produced this bundle.
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ID: RESOLVED_DEPLOYMENT_ID,
  },
  turbopack: {},
};

export default nextConfig;
