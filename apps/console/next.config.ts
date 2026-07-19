import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace packages consumed as TS source (identity/credit/key
  // substrate + zkLogin auth — SPEC_T2000_API_V2 §2).
  transpilePackages: ["@audric/accounts", "@audric/auth", "@audric/onramp"],
  poweredByHeader: false,
  async redirects() {
    // /join is the onboarding page (tabbed hire/sell, 2026-07-19); /sell and
    // /buy are aliases into it. The other retail-era paths (SPEC_HUB_V1)
    // stay parked on the hub home.
    return [
      { source: "/buy", destination: "/join", permanent: false },
      {
        source: "/sell",
        destination: "/join",
        permanent: false,
      },
      { source: "/browse", destination: "/", permanent: false },
      { source: "/tasks", destination: "/", permanent: false },
      { source: "/tasks/:id", destination: "/", permanent: false },
      { source: "/campaigns", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
