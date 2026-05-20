import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

// [v0.7c Session 5.5d / S.197d] Audric-branded landing redirect.
//
// web-v2/ (the bare Vercel project URL) is internal infrastructure;
// users always reach Audric via audric.ai (apps/web marketing → OAuth
// → audric.ai/new which rewrites to web-v2/chat in production).
// Anyone hitting audric-web-v2.vercel.app/ directly (fat-finger,
// crawler, debugger, social-share with stripped subdomain) lands on
// the (chat) route group's page.tsx — which today just returns
// `null` inside the template chat layout, exposing template chrome
// at a public URL.
//
// The redirect below routes web-v2/ to web-v2/chat (the canonical
// Audric entry). `/chat`'s existing pre-auth Splash-B (see
// `app/chat/audric-chat-client.tsx` lines 128-169) handles
// unauthenticated visitors — same hero lockup as apps/web's
// `components/landing/HeroSection.tsx` so users see brand
// continuity. Authenticated users see their chat directly.
//
// Doesn't fight the demo basePath (IS_DEMO=1), which owns `/` →
// `/demo`. The conditional below preserves that behavior verbatim
// and only adds the `/` → `/chat` redirect when basePath is empty
// (production, preview, and local dev).
const nextConfig: NextConfig = {
  ...(basePath
    ? {
        basePath,
        assetPrefix: "/demo-assets",
        redirects: async () => [
          {
            source: "/",
            destination: basePath,
            permanent: false,
            basePath: false,
          },
        ],
      }
    : {
        redirects: async () => [
          {
            source: "/",
            destination: "/chat",
            permanent: false,
          },
        ],
      }),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  cacheComponents: true,
  devIndicators: false,
  poweredByHeader: false,
  reactCompiler: true,
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  experimental: {
    prefetchInlining: true,
    cachedNavigations: true,
    appNewScrollHandler: true,
    inlineCss: true,
    turbopackFileSystemCacheForDev: true,
  },
};

export default withBotId(nextConfig);
