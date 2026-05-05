/**
 * Vitest global setup — pre-populates the env vars that `lib/env.ts`
 * marks as required, so module-level `import { env } from '@/lib/env'`
 * statements don't throw at collection time when individual test files
 * forget to set them.
 *
 * Tests that exercise env-validation behavior itself (e.g.
 * `lib/__tests__/env.test.ts`) wipe these in their `beforeEach` and
 * set their own values; the cleanup in their `afterEach` restores
 * `process.env` from a snapshot taken before the test ran, so the
 * baseline established here remains intact for sibling files.
 *
 * We DON'T call any real network — every value here is a placeholder
 * formatted to satisfy the schema (non-empty after trim, correct enum
 * for SUI_NETWORK).
 */

const TEST_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: 'sk-ant-test-vitest-setup',
  BLOCKVISION_API_KEY: 'bv-test-vitest-setup',
  DATABASE_URL: 'postgres://test@localhost/audric_test',
  ENOKI_SECRET_KEY: 'enoki-test-vitest-setup',
  T2000_INTERNAL_KEY: 't2000-test-vitest-setup',
  UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-test-vitest-setup',
  // SPEC 10 B.2 — required as of S.69 follow-up. Placeholder format is
  // not a real Bech32 key (decodeSuiPrivateKey would reject it), but
  // the env-gate only enforces non-empty-string; format-validation lives
  // at the route boundary in `/api/identity/reserve`.
  AUDRIC_PARENT_NFT_PRIVATE_KEY: 'suiprivkey-test-vitest-setup',
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'google-test-vitest-setup',
  NEXT_PUBLIC_ENOKI_API_KEY: 'enoki-pub-test-vitest-setup',
  NEXT_PUBLIC_SUI_NETWORK: 'mainnet',
};

for (const [k, v] of Object.entries(TEST_ENV)) {
  if (!process.env[k]) process.env[k] = v;
}
