import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

// Email links must live on the sending domain (deliverability — mismatched
// URLs trip spam filters), so external destinations get audric.ai aliases.
const sharedRedirects: {
  source: string;
  destination: string;
  permanent: boolean;
  basePath: false;
}[] = [
  {
    source: "/call",
    destination: "https://cal.com/funkii/15min",
    permanent: false,
    basePath: false,
  },
];

const nextConfig: NextConfig = {
  // Workspace packages consumed as TS source (the shared identity/credit/key
  // substrate + zkLogin auth — SPEC_T2000_API_V2 §2).
  transpilePackages: ["@audric/accounts", "@audric/auth", "@audric/onramp"],
  // @t2000/sdk `verifyReceipt` dynamically imports @phala/dcap-qvl (CJS + WASM
  // for client-side DCAP). Keep it external so Next doesn't try to bundle the
  // WASM during page-data collection (the verify route only ever runs it server-
  // side, and with skipQuote it isn't even reached).
  serverExternalPackages: ["@phala/dcap-qvl"],
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
          ...sharedRedirects,
        ],
      }
    : { redirects: async () => sharedRedirects }),
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
