import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// ---------------------------------------------------------------------------
// `audric/canonical-portfolio` (single-source-of-truth) enforcement.
//
// See `.cursor/rules/single-source-of-truth.mdc`. Every wallet / position
// / price / history read MUST go through one of the canonical fetchers
// in `apps/web/lib/portfolio.ts`, `transaction-history.ts`, or `rates.ts`.
// This block bans the forbidden raw-vendor / raw-RPC patterns outside
// those files.
//
// If you genuinely need to bypass (e.g. tx-build balance check), add
// `// eslint-disable-next-line ... -- CANONICAL-BYPASS: <reason>` and
// link a follow-up issue to consolidate.
// ---------------------------------------------------------------------------

const CANONICAL_FILES = [
  "lib/portfolio.ts",
  "lib/portfolio-data.ts",
  "lib/transaction-history.ts",
  "lib/rates.ts",
  "lib/__tests__/**",
];

const canonicalPortfolioRules = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "@/lib/portfolio-data",
          message:
            "Import `getPortfolio` / `getWalletSnapshot` from `@/lib/portfolio` instead. `portfolio-data.ts` is a private dependency of the canonical fetcher.",
        },
      ],
      patterns: [
        {
          // Direct engine fetchers must be wrapped by canonical helpers
          // so the dashboard / cron / engine all see identical numbers.
          group: ["@t2000/engine"],
          importNames: [
            "fetchAddressPortfolio",
            "fetchTokenPrices",
            "fetchWalletCoins",
          ],
          message:
            "Use `getPortfolio` (or `getTokenPrices`) from `@/lib/portfolio` instead — the canonical wrapper handles caching, fallback, and shape consistency.",
        },
      ],
    },
  ],
  "no-restricted-properties": [
    "error",
    {
      object: "client",
      property: "getBalance",
      message:
        "Wallet reads must go through `getPortfolio` from `@/lib/portfolio`. If you genuinely need a coin-type-precise read (rare — only for tx-build validation), add `// eslint-disable-next-line ... -- CANONICAL-BYPASS: <reason>`.",
    },
    {
      object: "client",
      property: "getAllBalances",
      message:
        "Wallet reads must go through `getPortfolio` from `@/lib/portfolio`.",
    },
    {
      object: "client",
      property: "getCoinMetadata",
      message:
        "Coin metadata is bundled with `getPortfolio`'s priced wallet response. Use that instead.",
    },
  ],
  "no-restricted-syntax": [
    "error",
    {
      // Block direct vendor HTTP calls; price/wallet aggregation must
      // go through `getPortfolio` / `getTokenPrices` so vendor-specific
      // chunking / timeouts / fallback live in one place.
      selector:
        "CallExpression[callee.name='fetch'] > Literal[value=/api\\.blockvision\\.org|coins\\.llama\\.fi|api\\.coingecko\\.com/]",
      message:
        "Direct vendor calls (BlockVision / DefiLlama / CoinGecko) for wallet or price data are forbidden — use `getPortfolio` / `getTokenPrices` from `@/lib/portfolio` so chunking, timeouts, and fallback live in one place.",
    },
    {
      selector:
        "CallExpression[callee.name='fetch'] > TemplateLiteral > TemplateElement[value.raw=/api\\.blockvision\\.org|coins\\.llama\\.fi|api\\.coingecko\\.com/]",
      message:
        "Direct vendor calls (BlockVision / DefiLlama / CoinGecko) for wallet or price data are forbidden — use `getPortfolio` / `getTokenPrices` from `@/lib/portfolio`.",
    },
  ],
};

// ---------------------------------------------------------------------------
// `audric/no-process-env` (env-validation) enforcement.
//
// Every `process.env.X` read MUST go through the validated `lib/env`
// module. Direct `process.env` reads bypass the boot-time schema
// validation that prevents the "Vercel stored an empty string" bug
// class (April 2026 BlockVision incident — see `lib/env.ts` header).
//
// Allowlist:
//  - `lib/env.ts` itself: defines the schema and proxies every read.
//  - `lib/__tests__/env.test.ts`: mutates process.env to test the gate.
//  - `next.config.ts` + `instrumentation.ts`: bootstrap code that
//    necessarily runs before/around the env module load.
//  - `lib/engine/synthetic-sessions.ts` `__test_*` helpers: deliberate
//    test escape hatch, line-disabled at the call site.
//  - Any test file that needs to mutate process.env for setup/teardown
//    (test files end with `.test.ts` or `.test.tsx`).
//
// To bypass, add `// eslint-disable-next-line no-restricted-syntax --
// PROCESS-ENV-BYPASS: <reason>` and link an issue justifying why.
// ---------------------------------------------------------------------------

const noProcessEnvRule = {
  "no-restricted-syntax": [
    "error",
    {
      // Ban `process.env.X` reads EXCEPT `process.env.NODE_ENV`. NODE_ENV
      // is a Next.js / build-tool managed constant statically replaced
      // into both server and client bundles — it cannot be empty or
      // whitespace, so the env-gate has nothing to add. Forcing it
      // through the gate would also break the proxy guard (the
      // server-only check would throw on every client `if (NODE_ENV ===
      // 'production')` branch).
      selector:
        "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']",
      message:
        "Read env vars through `import { env } from '@/lib/env'` instead of `process.env.X`. The validated env module rejects empty/whitespace values at boot, preventing the silent-degradation bug class. (`process.env.NODE_ENV` is exempted — it's a build-time constant.) To bypass for legitimate test/bootstrap code, add `// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: <reason>`.",
    },
  ],
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      ...CANONICAL_FILES,
      // The CLI / engine packages live outside this app and have their
      // own rules; the protocol-registry is the lowest layer that
      // canonical fetchers themselves consume.
      "lib/protocol-registry.ts",
      "lib/sui-rpc.ts",
    ],
    rules: canonicalPortfolioRules,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      // The env module IS the gate — it has to read process.env.
      "lib/env.ts",
      // Tests for the env gate mutate process.env to verify rejection.
      "lib/__tests__/env.test.ts",
      // Bootstrap code that runs before / coordinates the env module.
      "next.config.ts",
      "instrumentation.ts",
      // Prisma CLI config — loaded by `prisma migrate` before any app
      // code runs. It loads .env.local itself via dotenv and can't
      // depend on the validated env module.
      "prisma.config.ts",
      // Test files commonly need to mutate process.env for setup/teardown.
      "**/*.test.ts",
      "**/*.test.tsx",
      "vitest.setup.ts",
      // Generated code — comments only, doesn't actually read process.env.
      "lib/generated/**",
    ],
    rules: noProcessEnvRule,
  },
];

export default eslintConfig;
