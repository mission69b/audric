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
  // NOTE: canonical-portfolio's `no-restricted-syntax` vendor-fetch bans
  // (BlockVision / DefiLlama / CoinGecko) live in `combinedRestrictedSyntax`
  // below. ESLint flat config OVERRIDES rule values across blocks (verified
  // empirically 2026-05-02 — see SPEC 7 v0.4.1 C0.2 patch notes). All
  // `no-restricted-syntax` selectors must coexist in a single rule entry.
};

// ---------------------------------------------------------------------------
// `audric/canonical-write` (single-source-of-truth for writes) enforcement.
//
// SPEC 7 v0.4 Layer 0 contract: every Audric Enoki-sponsored write goes
// through one `composeTx({ steps })` primitive in `@t2000/sdk`. Direct
// `new Transaction()` construction in `app/api/**`, `components/**`, or
// `lib/**` is forbidden — the rule fails CI on those constructors.
//
// Documented bypasses (must use `// eslint-disable-next-line
// no-restricted-syntax -- CANONICAL-BYPASS: <reason>` at the call site):
//  - PayButton (`apps/web/components/pay/PayButton.tsx`) — dapp-kit
//    `useSignAndExecuteTransaction`, any-wallet payer, no Enoki. Stays
//    out by design. Resolved decision #29.
//  - SPEC 10 leaf-mint API routes (`app/api/identity/**`) — service-
//    account-signed; user's zkLogin key is NOT involved. Smoke-tested
//    mainnet 2026-05-01 (S.52). Structurally outside canonical contract.
//  - Routes scheduled for SPEC 7 P2.2c migration: `transactions/prepare`,
//    `services/prepare`, `debug-swap` — tagged with the migration stage
//    label. The bypass comments are removed when each route flips to
//    `composeTx`.
//
// See `audric/.cursor/rules/audric-canonical-write.mdc` for the full
// architectural contract. Spec section: SPEC 7 v0.4 § "Layer 0 — Canonical
// Write Architecture" (build-tracker P2.2d).
// ---------------------------------------------------------------------------

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

// Combined `no-restricted-syntax` selectors. ESLint flat config OVERRIDES
// rule values rather than merging across blocks — verified empirically on
// 2026-05-02 — so all selectors must live in ONE rule entry to coexist.
// (Prior to consolidation, canonical-portfolio's vendor-fetch bans were
// silently overridden by the env-gate's `no-restricted-syntax` rule.
// Surfaced + fixed during SPEC 7 v0.4.1 C0.2 ESLint rule landing.)
const combinedRestrictedSyntax = [
  // audric/no-process-env — env-validation gate
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']",
    message:
      "Read env vars through `import { env } from '@/lib/env'` instead of `process.env.X`. The validated env module rejects empty/whitespace values at boot, preventing the silent-degradation bug class. (`process.env.NODE_ENV` is exempted — it's a build-time constant.) To bypass for legitimate test/bootstrap code, add `// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: <reason>`.",
  },
  // audric/canonical-portfolio — vendor fetch bans (literal URL form)
  {
    selector:
      "CallExpression[callee.name='fetch'] > Literal[value=/api\\.blockvision\\.org|coins\\.llama\\.fi|api\\.coingecko\\.com/]",
    message:
      "Direct vendor calls (BlockVision / DefiLlama / CoinGecko) for wallet or price data are forbidden — use `getPortfolio` / `getTokenPrices` from `@/lib/portfolio` so chunking, timeouts, and fallback live in one place.",
  },
  // audric/canonical-portfolio — vendor fetch bans (template literal form)
  {
    selector:
      "CallExpression[callee.name='fetch'] > TemplateLiteral > TemplateElement[value.raw=/api\\.blockvision\\.org|coins\\.llama\\.fi|api\\.coingecko\\.com/]",
    message:
      "Direct vendor calls (BlockVision / DefiLlama / CoinGecko) for wallet or price data are forbidden — use `getPortfolio` / `getTokenPrices` from `@/lib/portfolio`.",
  },
  // audric/canonical-write — direct PTB construction ban (SPEC 7 v0.4 Layer 0)
  {
    selector: "NewExpression[callee.name='Transaction']",
    message:
      "Direct PTB construction (`new Transaction()`) is forbidden in `app/api/**`, `components/**`, and `lib/**` — every Audric Enoki-sponsored write must go through `composeTx({ steps })` from `@t2000/sdk`. See `audric/.cursor/rules/audric-canonical-write.mdc` for the contract. Documented bypasses (PayButton dapp-kit flow, SPEC 10 leaf-mint API routes, SPEC 7 P2.2c pre-migration routes): add `// eslint-disable-next-line no-restricted-syntax -- CANONICAL-BYPASS: <reason>` at the call site.",
  },
];

const combinedRestrictedSyntaxRule = {
  "no-restricted-syntax": ["error", ...combinedRestrictedSyntax],
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    // Auto-generated Prisma client files emit `/* eslint-disable */`
    // headers for rules that aren't in our config (e.g. `no-unused-vars`
    // for the project-wide TS rule). With Next 15's
    // `--report-unused-disable-directives` default, every generated
    // file then triggers a "Unused eslint-disable directive" warning.
    // Ignoring the whole tree is the right call — generated code
    // shouldn't drive our lint output.
    ignores: ["lib/generated/**"],
  },
  {
    // PR-H3 (2026-04-30) bumped this from `warn` (Next.js default) to
    // `error` after fixing the 14 standing warnings. The 8 intentional
    // `eslint-disable-next-line react-hooks/exhaustive-deps` escape
    // hatches across the codebase still work at error-level, so genuine
    // exceptions remain explicit and reviewable. Any future regression
    // now fails CI immediately instead of accumulating as noise.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "react-hooks/exhaustive-deps": "error",
    },
  },
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
    // Combined `no-restricted-syntax` block. Holds env-gate, canonical-
    // portfolio vendor-fetch, and canonical-write `new Transaction()`
    // selectors. Single entry per the override-not-merge constraint.
    //
    // The ignore list is the UNION of every per-rule allowlist:
    //  - canonical-portfolio canonical fetchers (CANONICAL_FILES)
    //  - protocol-registry / sui-rpc (lower-layer dependencies)
    //  - env-gate exempt files (env.ts itself, env.test.ts, bootstrap)
    //  - tests (file-level escape via `**/*.test.{ts,tsx}` + `__tests__/`)
    //  - generated code
    files: ["**/*.{ts,tsx}"],
    ignores: [
      // canonical-portfolio: canonical fetchers + their lower-layer deps
      ...CANONICAL_FILES,
      "lib/protocol-registry.ts",
      "lib/sui-rpc.ts",
      // env-gate: the gate itself + its test + bootstrap entry-points
      "lib/env.ts",
      "lib/__tests__/env.test.ts",
      "next.config.ts",
      "instrumentation.ts",
      // Prisma CLI config — loaded by `prisma migrate` before any app
      // code runs. It loads .env.local itself via dotenv and can't
      // depend on the validated env module.
      "prisma.config.ts",
      // Test files commonly need to mutate process.env for setup/teardown
      // and to build raw `new Transaction()` for tx-build assertions.
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/__tests__/**",
      "vitest.setup.ts",
      // Generated code — comments only, doesn't actually read process.env
      // or build PTBs.
      "lib/generated/**",
    ],
    rules: combinedRestrictedSyntaxRule,
  },
];

export default eslintConfig;
