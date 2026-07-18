import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace packages consumed as TS source (identity/credit/key
  // substrate + zkLogin auth — SPEC_T2000_API_V2 §2).
  transpilePackages: ["@audric/accounts", "@audric/auth", "@audric/onramp"],
  poweredByHeader: false,
  async redirects() {
    // SPEC_HUB_V1: the retail pages (/join, /browse, /tasks) were deleted —
    // stale links land on the hub home. Selling = offerings (t2 ACP, shipped
    // Phase 1 2026-07-18): /sell lands on the offerings-first #sell section;
    // mpp exited the seller funnel (D-4).
    return [
      { source: "/buy", destination: "/", permanent: false },
      {
        source: "/sell",
        destination: "/jobs#sell",
        permanent: false,
      },
      { source: "/join", destination: "/", permanent: false },
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
