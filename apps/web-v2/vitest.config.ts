import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// [v0.7e Phase 2.0 — S.252 vitest spike]
// Mirrors apps/web/vitest.config.ts pattern (which Phase 2.1 will
// migrate the 37 engine .test.ts files into). Spike scope: validate
// the infra (vitest install + @/ alias resolution + setupFile env
// preload) WITHOUT migrating the engine source yet. Engine tests port
// in Phase 2.1 alongside the bulk `git mv apps/web/lib/engine/*`.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    // setupFiles runs BEFORE every test file is loaded — preload env
    // placeholders so module-level `import { env } from '@/lib/env'`
    // statements in tests don't throw at collection time. See
    // vitest.setup.ts for the placeholder values.
    setupFiles: ["./vitest.setup.ts"],
    exclude: [
      ...configDefaults.exclude,
      // Playwright lives in `tests/e2e/` and is run via `pnpm test:e2e`
      // (a separate runner). Vitest must NOT try to collect those.
      "tests/e2e/**",
      // Template debris — `lib/ai/models.test.ts` is a mock-fixture
      // module (chatModel / reasoningModel / titleModel) using the
      // `.test.` naming convention from the Vercel chatbot template,
      // but it contains zero `describe()` / `it()` blocks and has zero
      // importers in web-v2 (verified S.252). Excluded here so vitest
      // doesn't fail on "No test suite found". Cleaner long-term fix
      // is to rename or delete it; out of scope for this spike.
      "lib/ai/models.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
