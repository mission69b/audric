import type { NextConfig } from 'next';

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
      // `media-src 'self' blob:` so the voice mode HTMLAudioElement can
      // play the ElevenLabs MP3 we serve as an in-memory Blob URL.
      // Without `blob:`, CSP rejects the audio source with no console
      // hint that's easy to spot.
      "media-src 'self' blob:",
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
  turbopack: {},
};

export default nextConfig;
