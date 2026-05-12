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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
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
