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
