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

// ─────────────────────────────────────────────────────────────────────────────
// matchMedia mock — jsdom doesn't implement `window.matchMedia`. Components
// that read `prefers-reduced-motion` (Framer Motion's `useReducedMotion()`,
// our own a11y helpers) would either throw or get `undefined`. We default
// the mock to `matches: true` for `(prefers-reduced-motion: reduce)` so that:
//
//   1. Framer Motion's `useReducedMotion()` returns `true` in tests, which
//      causes <motion.*> components with reduced-motion-aware transitions
//      to skip their animations and jump to end-state synchronously. This
//      matters because AnimatePresence exit animations otherwise NEVER tick
//      in jsdom (no real raf-driven tweens) — see the explanatory comment
//      in `components/engine/timeline/primitives/__tests__/TransitionChip.test.tsx`
//      around the deliberately-not-tested rerender behavior. With this mock
//      in place, any `transition: { duration: reduceMotion ? 0 : 0.2 }`
//      branch resolves to 0 in tests → exit completes synchronously →
//      `await waitFor(() => expect(...).toBeNull())` works as expected on
//      conditionally-rendered <motion.div> children.
//
//   2. Tests that genuinely want to verify motion behavior (none today; if
//      a SPEC 23C item adds one, it can stub matchMedia inside the test
//      file to return `matches: false`).
//
// Default is conservative: assume reduced motion in tests so animation
// instrumentation never causes hangs or flakes. Founder smoke catches the
// real motion behavior in the browser.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: query.includes('prefers-reduced-motion: reduce'),
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated but Framer Motion still calls it
    removeListener: () => {}, // deprecated but Framer Motion still calls it
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
