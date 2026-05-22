/**
 * Vitest global setup — pre-populates env vars that `lib/env.ts` marks
 * as required, so module-level `import { env } from '@/lib/env'`
 * statements don't throw at collection time.
 *
 * [v0.7e Phase 2.0 — S.252 vitest spike] Mirrors apps/web/vitest.setup.ts
 * pattern (which Phase 2.1 will migrate alongside the engine tests).
 * Values are placeholder strings satisfying the Zod requiredString
 * contract (non-empty after trim); tests that exercise env-validation
 * itself wipe + restore in their own before/after hooks.
 */

const TEST_ENV: Record<string, string> = {
  // Server-required (per lib/env.ts serverSchema)
  DATABASE_URL: "postgres://test@localhost/audric_test",
  BLOCKVISION_API_KEY: "bv-test-vitest-setup",
  ENOKI_SECRET_KEY: "enoki-test-vitest-setup",
  // Client-required (NEXT_PUBLIC_* — used via literal in runtimeEnv)
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-test-vitest-setup",
  NEXT_PUBLIC_ENOKI_API_KEY: "enoki-pub-test-vitest-setup",
  NEXT_PUBLIC_SUI_NETWORK: "mainnet",
};

for (const [k, v] of Object.entries(TEST_ENV)) {
  if (!process.env[k]) {
    process.env[k] = v;
  }
}
