import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace packages consumed as TS source (identity/credit/key
  // substrate + zkLogin auth — SPEC_T2000_API_V2 §2).
  transpilePackages: ["@audric/accounts", "@audric/auth", "@audric/onramp"],
  poweredByHeader: false,
  // The agent-coin bytecode rewriter loads its wasm behind a dynamic import,
  // which Next's serverless file tracer misses — without this the launch
  // route 500s with ENOENT on move_bytecode_template_bg.wasm (S.810 dogfood).
  // Both glob roots covered: hoisted + pnpm virtual store.
  outputFileTracingIncludes: {
    "/api/capital/launch-prepare": [
      "./node_modules/@mysten/move-bytecode-template/**",
      "../../node_modules/.pnpm/@mysten+move-bytecode-template@*/node_modules/@mysten/move-bytecode-template/**",
    ],
  },
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
      // Skills shelf removed from the console (2026-07-19) — skills live in
      // the docs + the t2000.ai manifest; the store sells agents, not docs.
      { source: "/skills", destination: "/", permanent: false },
      { source: "/skills/:project", destination: "/", permanent: false },
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
