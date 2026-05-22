/**
 * # Validated environment configuration — single source of truth.
 *
 * **Why this file exists.** Per the t2000 monorepo `env-validation-gate`
 * rule, every app in `apps/*` MUST validate its env contract at boot
 * via a Zod schema and expose values through a typed proxy. The Apr
 * 2026 BLOCKVISION_API_KEY=="" incident (4-day silent degradation in
 * audric/web prod) is the reason the rule exists.
 *
 * ## Scope for v0.7c Phase 2 P2.0a
 *
 * This module currently validates ONLY the env vars web-v2's *new*
 * code (Day 1c + Phase 2 ports) reads. The vendored template still has
 * ~25 `process.env.X` reads scattered across components / hooks /
 * routes (mostly `NEXT_PUBLIC_BASE_PATH ?? ""` no-op fallbacks). Those
 * are pre-existing template baseline and get folded through the gate
 * incrementally as each surface gets touched in later Phase 2 days.
 * See F-19 in `HANDOFF_NEXT_AGENT.md` for the cleanup follow-up.
 *
 * ## Rules
 * 1. Every NEW server-side `process.env.X` access goes through `env.X`.
 * 2. Required vars throw at module load if missing, empty, or
 *    whitespace-only. Error lists every misconfigured var (not just
 *    the first) plus the Vercel env settings URL.
 * 3. NEXT_PUBLIC_* vars use literal `process.env.NEXT_PUBLIC_X` in the
 *    `runtimeEnv` map so Next.js's static replacement works.
 * 4. Schema runs at first import. Trigger from `instrumentation.ts`
 *    `register()` hook so misconfigured deploys fail loudly at boot.
 *
 * ## Adding a new env var
 * 1. Add to `serverSchema` or `clientSchema` with a doc comment.
 * 2. Add to `runtimeEnv` with a literal `process.env.X` reference.
 * 3. Use `env.X` everywhere. Never `process.env.X`.
 */

import { z } from "zod";

const requiredString = z
  .string()
  .trim()
  .min(1, "must be a non-empty string (Vercel may have stored an empty value)");

const optionalString = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined) {
      return;
    }
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

// ─── Server schema ────────────────────────────────────────────────────
// These vars MUST NEVER be referenced from client components. The
// proxy at the bottom of this file throws if a client-side read is
// attempted.
const serverSchema = z.object({
  /** Postgres connection string for Prisma — points at the same NeonDB
   * as audric/web in Phase 2. P2.0c wires Prisma. */
  DATABASE_URL: requiredString,

  /** Anthropic Claude API key — powers every LLM call. Day 2a uses
   * this directly; Day 2c wraps via AI Gateway and switches to
   * AI_GATEWAY_API_KEY. */
  ANTHROPIC_API_KEY: optionalString,

  /** Vercel AI Gateway API key — powers Day 2c+. Required only when
   * the route opts into the `gateway()` wrapper. Optional in Day 2a
   * (direct Anthropic). */
  AI_GATEWAY_API_KEY: optionalString,

  /** BlockVision Pro Indexer REST API key (Day 2b+). Required for the
   * `balance_check` read tool: backs both Sui RPC routing (paid
   * private endpoint) AND the portfolio fetcher (`fetchAddressPortfolio`).
   * `BLOCKVISION_API_KEY=""` in audric/web prod silently degraded every
   * BlockVision feature for 4 days (April 2026) — empty-string is
   * invalid here, hence `requiredString` semantics. */
  BLOCKVISION_API_KEY: requiredString,

  /** Optional Sui RPC URL override — defaults to BlockVision-routed
   * mainnet via `getSuiRpcUrl()`. Set this only to point at a custom
   * fullnode (testnet / devnet / self-hosted). */
  SUI_RPC_URL: optionalString,

  /** Enoki secret key (server-only) — sponsors gas for every user
   * transaction. Used by `/api/transactions/prepare` to assemble the
   * sponsored tx block via Enoki's `transaction-blocks/sponsor` endpoint
   * and by `/api/transactions/execute` to co-sign + submit after the
   * client signs. Phase 3 Day 3b ports both routes from legacy
   * `audric/web`; this is the unblocking env var. NEVER expose to
   * clients — they only get `NEXT_PUBLIC_ENOKI_API_KEY` (the
   * publishable equivalent). */
  ENOKI_SECRET_KEY: requiredString,

  /** Shared cross-app internal-key for trusted server-side reads against
   * apps/web. Session 3 (Phase 6) uses it to fetch the public-profile
   * portfolio panel via apps/web's `/api/portfolio` endpoint
   * (`authenticateAnalyticsRequest` dual-auth path). Same value as
   * apps/web's `T2000_INTERNAL_KEY` — Vercel env vars are shared across
   * deploys in the same project. Optional because pre-cutover preview
   * deploys may not have it set yet; when absent the profile page
   * degrades silently (portfolio panel hidden). */
  T2000_INTERNAL_KEY: optionalString,

  /** Internal-API base URL for engine tools' cross-app fetches. Threaded
   * through `ToolContext.env.AUDRIC_INTERNAL_API_URL` so engine
   * helpers (`audric-api.ts:getAudricApiBase`) resolve canonical
   * `/api/portfolio` + `/api/history` + `/api/analytics/*` URLs.
   *
   * v0.7c Phase 6 Session 5 flip (founder-owned, Vercel UI):
   *   pre-cutover: `https://audric.ai` (engine routes to apps/web)
   *   post-flip:   `https://audric-web-v2.vercel.app` (engine routes to web-v2)
   *
   * Optional because the engine itself falls back to
   * `process.env.AUDRIC_INTERNAL_API_URL` → `process.env.NEXT_PUBLIC_APP_URL`
   * → `null` when this is absent. Validating here catches the
   * empty-string-in-Vercel-UI bug class (S.20 / Apr 2026
   * BlockVision incident) BEFORE the engine fails over to a stale
   * fallback. */
  AUDRIC_INTERNAL_API_URL: optionalString,

  /** Upstash Redis REST URL — backs the per-session spend ledger that
   * feeds `resolvePermissionTier`'s daily-cap downgrade rule (engine
   * v2.7.0+ `ToolContext.sessionSpendUsd`). Same Upstash instance as
   * apps/web (shared Vercel env vars across project deploys).
   *
   * **Why OPTIONAL (not required):** the daily-cap downgrade rule is
   * a SECOND line of defense — the engine's per-call
   * `resolvePermissionTier(operation, amountUsd, config)` runs every
   * write either way. The cumulative session-spend accumulator is the
   * runtime safety net for the rare "user makes 50 sub-threshold
   * writes in one session and crosses autonomousDailyLimit" case.
   * Today web-v2 has zero auto-tier writes in production (all
   * confirm-tier; user always taps), so the accumulator never fires.
   * Making it OPTIONAL means web-v2 boots cleanly during local dev /
   * preview deploys / the v0.7c soak window even if Upstash isn't yet
   * configured. Production deploys MUST set both vars (paired with
   * UPSTASH_REDIS_REST_TOKEN); absent → `lib/upstash.ts` exports
   * `null` → `getSessionSpend` short-circuits to 0 → daily-cap rule
   * reads 0 → degraded-but-safe.
   *
   * Group E wired 2026-05-21 (S.214 follow-on) — pre-Phase-1 polish
   * carry-over from v0.7c §6.5.E (Phase 6.5 scope-locked at Option B+,
   * Group E was on the cutting-room floor). Lights up real plumbing so
   * Phase 1's auto-tier writes (if/when activated) have a working
   * accumulator without further integration work.
   *
   * **Founder ops (Vercel project: `audric-web-v2`):** copy
   * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` from the
   * `audric-web` project's Vercel env (Production + Preview). Same
   * Upstash database; key namespace shared. Setting them is what
   * activates the safety net; absence is degraded-but-safe. */
  UPSTASH_REDIS_REST_URL: optionalString,

  /** Upstash Redis REST token — paired with `UPSTASH_REDIS_REST_URL`.
   * See doc on that var for full context. Optional for same reasons:
   * absence means degraded-but-safe (session-spend ledger returns 0). */
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  /** MemWal delegate-key Ed25519 private key (hex). Auth for the MemWal
   * SDK to act on behalf of a MemWalAccount on Sui. v0.7d Phase 1
   * (S.215, 2026-05-21) wires the audric `MemWalMemoryStore` adapter
   * against this credential.
   *
   * **Phase 1 scope (founder-locked 2026-05-21):** ONE founder-owned
   * MemWal account + per-user namespace strings for the initial smoke.
   * Phase 1.5 / Phase 2 adds per-user MemWal account provisioning
   * (one MemWalAccount per audric user, true crypto-isolation between
   * users — matches Mysten's `MystenLabs/MemWal/apps/chatbot` reference).
   * The transition from "founder-owned single account" to "per-user
   * accounts" is invisible at this env-var layer; only the construction
   * site in `lib/memwal.ts` changes from a singleton to a factory.
   *
   * **Why OPTIONAL (not required):** v0.7d Phase 1 ships the wire WITH
   * the env vars unset in Vercel by default. The chat route checks for
   * client presence and conditionally injects `EngineConfig.memoryStore`
   * (Day 1b); absence means the engine takes the legacy path (no
   * `<memory_recall>` block, falls back to fresh tools — same posture
   * as v0.7c). This pattern (same as `UPSTASH_REDIS_REST_URL` above)
   * means Vercel deploys never break on missing MemWal config, and the
   * founder can flip the switch by adding the env var when ready to
   * activate memory recall in prod.
   *
   * **Founder ops (Vercel project: `audric-web-v2`):** create a MemWal
   * account via `app.memwal.com`, copy the delegate key + accountId
   * into `MEMWAL_PRIVATE_KEY` + `MEMWAL_ACCOUNT_ID` (Production +
   * Preview environments). Server URL defaults to
   * `https://relayer.memwal.ai/` when MEMWAL_SERVER_URL unset. */
  MEMWAL_PRIVATE_KEY: optionalString,

  /** MemWal account object ID on Sui (e.g. `0x...`). Pairs with
   * MEMWAL_PRIVATE_KEY — see doc on that var for full context. Optional
   * for same reasons: absence → `lib/memwal.ts` exports `null` →
   * `MemWalMemoryStore` not constructed → engine takes the no-memory
   * path (degraded-but-safe). */
  MEMWAL_ACCOUNT_ID: optionalString,

  /** MemWal relayer server URL. Defaults to `https://relayer.memwal.ai/`
   * (the Mysten-operated production relayer) when unset. Set this only
   * for testing against a non-production MemWal deploy (e.g. local Rust
   * server during dev, or Mysten-hosted staging). */
  MEMWAL_SERVER_URL: optionalString,

  /** Bearer token Vercel injects into the `Authorization` header when
   * invoking cron paths (`/api/cron/*`). Mirrors apps/web's `CRON_SECRET`
   * — same Upstash-managed value across both Vercel projects so a single
   * rotation covers both apps during the v0.7c soak window.
   *
   * **Why OPTIONAL (not required):** the only consumer today is the
   * `financial-context-snapshot` route (S.253 cron port, 2026-05-22).
   * Local dev / preview builds without crons configured must still boot;
   * the route's auth check returns 401 when the value is absent which
   * matches "no Vercel cron has invoked it" semantics. Production deploys
   * MUST set it — Vercel won't schedule the cron without a matching
   * env var anyway.
   *
   * **Founder ops (Vercel project: `audric-web-v2`):** copy `CRON_SECRET`
   * verbatim from the `audric-web` project's Vercel env (Production +
   * Preview). Same value across both projects — both crons race on the
   * same upserts, idempotent by `userId`, harmless when both run. When
   * apps/web is archived the web-v2 cron becomes the sole writer. */
  CRON_SECRET: optionalString,

  /** Bech32 (`suiprivkey1…`) Ed25519 secret key for the Audric parent NFT
   * custody address that signs `<label>.audric.sui` leaf-mint and revoke
   * transactions. Backs `/api/identity/reserve` (mint) and
   * `/api/identity/change` (revoke + mint). Server-only.
   *
   * **Why OPTIONAL (not required):** v0.7e Phase 2 / S.253 ports the two
   * identity write routes into web-v2 alongside the env contract. Until
   * the founder copies the secret from the audric-web Vercel project
   * into audric-web-v2 (Production + Preview), the routes degrade
   * cleanly — `loadCustodyKeypair()` returns `null` and the route
   * surfaces a 503 instead of crashing the boot. Mirrors the same
   * "feature degrades, app boots" pattern used for `UPSTASH_REDIS_REST_URL`
   * and the MemWal vars. Flip the switch by setting this var; no code
   * deploy needed.
   *
   * **Founder ops (Vercel project: `audric-web-v2`):** copy the secret
   * verbatim from the audric-web project — same custody address is
   * shared across both apps during the soak window; post-cutover the
   * audric-web project archives and the secret lives only in web-v2. */
  AUDRIC_PARENT_NFT_PRIVATE_KEY: optionalString,

  /** Cap on concurrent in-flight identity-reserve mints (Upstash counter).
   * Defaults to 5 — the empirical sweet spot from the May 2026 burst-50
   * load test (25 concurrent → 4% success; 5 concurrent → ~80% success).
   * Tunable without redeploy via Vercel env. See
   * `lib/identity/admission-control.ts` for the full rationale. */
  AUDRIC_MINT_CONCURRENCY_LIMIT: optionalString,
});

// ─── Client schema ────────────────────────────────────────────────────
// NEXT_PUBLIC_* vars are statically replaced into client bundles. The
// schema validates at server boot AND at first import in the browser.
const clientSchema = z.object({
  /** Google OAuth client id for zkLogin. Used by `verifyJwt` to check
   * the JWT audience claim. */
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: requiredString,

  /** Enoki public API key (zkLogin + gas sponsorship). Treated as a
   * publishable key by Enoki — safe to ship to clients. Used server-
   * side too for `deriveAddressFromEnoki`. */
  NEXT_PUBLIC_ENOKI_API_KEY: requiredString,

  /** Sui network identifier — `mainnet` / `testnet` / `devnet`. Used
   * by `getSuiRpcUrl()` to build the BlockVision-routed RPC URL.
   * Required so the client-side wallet provider (Phase 3) can target
   * the same network as the server-side reads. */
  NEXT_PUBLIC_SUI_NETWORK: requiredString,

  /** Optional cross-app base URL for fetching apps/web APIs from
   * web-v2 during the v0.7c migration window. When set, the
   * `audricWebUrl()` helper prefixes cross-app paths with it. Empty /
   * unset means same-origin (works post-cutover when audric.ai serves
   * both apps via Vercel rewrites). Example values:
   *   `https://audric.ai` (prod testing pre-cutover from preview)
   *   `https://audric.ai` (post-cutover same-origin fallback)
   *   `` (unset → same-origin) */
  NEXT_PUBLIC_AUDRIC_WEB_URL: optionalString,
});

// ─── Runtime ──────────────────────────────────────────────────────────
// Literal references — Next.js static replacement requires this:
const runtimeEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  BLOCKVISION_API_KEY: process.env.BLOCKVISION_API_KEY,
  SUI_RPC_URL: process.env.SUI_RPC_URL,
  ENOKI_SECRET_KEY: process.env.ENOKI_SECRET_KEY,
  T2000_INTERNAL_KEY: process.env.T2000_INTERNAL_KEY,
  AUDRIC_INTERNAL_API_URL: process.env.AUDRIC_INTERNAL_API_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  MEMWAL_PRIVATE_KEY: process.env.MEMWAL_PRIVATE_KEY,
  MEMWAL_ACCOUNT_ID: process.env.MEMWAL_ACCOUNT_ID,
  MEMWAL_SERVER_URL: process.env.MEMWAL_SERVER_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  AUDRIC_PARENT_NFT_PRIVATE_KEY: process.env.AUDRIC_PARENT_NFT_PRIVATE_KEY,
  AUDRIC_MINT_CONCURRENCY_LIMIT: process.env.AUDRIC_MINT_CONCURRENCY_LIMIT,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_ENOKI_API_KEY: process.env.NEXT_PUBLIC_ENOKI_API_KEY,
  NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
  NEXT_PUBLIC_AUDRIC_WEB_URL: process.env.NEXT_PUBLIC_AUDRIC_WEB_URL,
};

const isServer =
  typeof process !== "undefined" &&
  (typeof process.versions?.node === "string" ||
    process.env?.NEXT_RUNTIME === "edge");

const fullSchema = z.object({
  ...serverSchema.shape,
  ...clientSchema.shape,
});

const schemaToValidate = isServer ? fullSchema : clientSchema;
const parsed = schemaToValidate.safeParse(runtimeEnv);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    [
      "",
      "═══════════════════════════════════════════════════════════════",
      "  Environment configuration is invalid.",
      "═══════════════════════════════════════════════════════════════",
      "",
      issues,
      "",
      "Fix in Vercel settings (Production / Preview):",
      "  https://vercel.com/dashboard → Project → Settings → Environment Variables",
      "",
      "Or locally in `apps/web-v2/.env.local`.",
      "═══════════════════════════════════════════════════════════════",
      "",
    ].join("\n")
  );
}

// Type assertion: on the client, server-only keys are stripped to
// `undefined` by Next.js's bundler before Zod sees them, so they're
// absent at runtime. The proxy guard below makes any client-side read
// throw before the undefined can leak into business logic. Asserting
// to FullEnv lets server callsites (route handlers, instrumentation,
// `lib/prisma.ts`) see the full type without TS narrowing them to the
// client schema.
type FullEnv = z.infer<typeof fullSchema>;
const parsedData = parsed.data as FullEnv;

const SERVER_ONLY_KEYS = new Set<string>(Object.keys(serverSchema.shape));

/**
 * Validated, strongly-typed env handle. Server-only vars throw on
 * client-side access (Next.js's bundler strips them to `undefined`,
 * so the silent-undefined failure mode is the bug this guard prevents).
 */
export const env = new Proxy(parsedData, {
  get(target, prop) {
    if (!isServer && SERVER_ONLY_KEYS.has(prop as string)) {
      throw new Error(
        `[env] Cannot access server-only var '${String(prop)}' from the client.`
      );
    }
    return target[prop as keyof typeof target];
  },
}) as FullEnv;

export type Env = FullEnv;
