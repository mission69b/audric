import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

// Demo deployment basePath. When `IS_DEMO=1` is set, the whole app is
// served under `/demo` so the marketing landing at `/` redirects there.
// Production (basePath === "") serves the marketing landing directly at
// `/` — that file is `app/page.tsx` (ported from apps/web at v0.7e
// Phase 2 / S.253).
//
// [v0.7e Phase 2 / S.253 — 2026-05-22] DROPPED the production `/` →
// `/chat` edge redirect that S.197d added. At S.197d web-v2's root was
// bare template chrome with no marketing page; the redirect was the
// "branded landing" stopgap. Now that `app/page.tsx` IS the marketing
// landing (verbatim port of apps/web's), the edge redirect blocked it
// from rendering. The auth-redirect lives client-side in `page.tsx`:
// authenticated users get `router.replace("/chat")` after hydration;
// unauthenticated users see the full marketing landing.
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
    : {}),
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
