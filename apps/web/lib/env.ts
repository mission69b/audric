/**
 * # Validated environment configuration — single source of truth.
 *
 * **Why this file exists:** Apr 2026, a production deploy ran for ~4 days
 * with `BLOCKVISION_API_KEY=""` (empty string in Vercel), silently
 * degrading every BlockVision-backed feature (DeFi aggregation, wallet
 * pricing, token prices). The bug surfaced as "the LLM thinks the user
 * has no DeFi positions" — three layers below the actual misconfig.
 *
 * The root cause was that every `process.env.X` read in the codebase
 * accepted `""` and `undefined` interchangeably and silently fell through
 * to a degraded path. There was no boot-time gate, no schema, no signal.
 *
 * This module is the gate.
 *
 * ## Rules
 * 1. **Every** server-side `process.env.X` access goes through `env.X`.
 *    A lint rule (`no-process-env`) enforces this — only this file and
 *    Next.js-generated code may touch `process.env` directly.
 * 2. **Required** vars throw at module load if missing, empty, or
 *    whitespace-only. The error lists every misconfigured var (not just
 *    the first) plus a link to the Vercel env settings page so the fix
 *    is one click away.
 * 3. **Optional** vars are typed as `string | undefined`. Empty/whitespace
 *    is normalized to `undefined` (so `if (env.X)` does the right thing
 *    without a custom truthy check at every call site).
 * 4. **NEXT_PUBLIC_*** vars are bundled into client code by Next.js. They
 *    use literal `process.env.NEXT_PUBLIC_X` references in the
 *    `runtimeEnv` map below so Next's static replacement still works.
 * 5. The schema runs once at first import. Importing this module from a
 *    server entrypoint (route, instrumentation hook, next.config) is what
 *    triggers boot-time validation.
 *
 * ## Adding a new env var
 * 1. Add it to `serverSchema` or `clientSchema` with the correct
 *    requiredness + a 1-line doc comment explaining what it gates.
 * 2. Add it to `runtimeEnv` with a literal `process.env.X` reference.
 * 3. Use `env.X` everywhere. Never `process.env.X`.
 *
 * ## Why not @t3-oss/env-nextjs?
 * It's a great library. We rolled this one by hand because (a) we want
 * full control over the error message format (it tells you the Vercel
 * URL, the broken keys, and what each one gates), (b) zero new deps,
 * (c) it's <200 lines and we already know what every var is for.
 */

import { z } from 'zod';

// A non-empty string after trim. The original bug was Vercel storing
// `""` (literal empty string), which `z.string()` accepts. We need
// `.trim().min(1)` to reject empty AND whitespace-only.
const requiredString = z
  .string()
  .trim()
  .min(1, 'must be a non-empty string (Vercel may have stored an empty value)');

// Optional string that normalizes empty/whitespace → undefined. Without
// this, callers writing `if (env.X)` would treat `""` as set-but-falsy
// and write subtly broken fallbacks.
const optionalString = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

// ─── Server-side schema ────────────────────────────────────────────────
// These vars live only in server code (API routes, server components,
// instrumentation, cron handlers). They MUST NEVER be referenced from
// client components — Next.js will bundle them out and the validation
// will pass at build time but `env.X` at runtime in the browser will
// throw the proxy guard at the bottom of this file.
const serverSchema = z.object({
  // ── Required: app cannot serve a single request without these ────────
  /** Anthropic Claude API key — powers every LLM call in the engine. */
  ANTHROPIC_API_KEY: requiredString,

  /**
   * BlockVision Pro API key — backs the wallet portfolio (`/account/coins`),
   * DeFi portfolio (`/account/defiPortfolio` for Bluefin/Suilend/Cetus/etc.),
   * and token price feed (`/coin/price/list`). Without this, every
   * portfolio number falls back to an unpriced Sui-RPC degraded path.
   * The original bug this entire env module exists to prevent.
   */
  BLOCKVISION_API_KEY: requiredString,

  /** Postgres connection string for Prisma + Neon. */
  DATABASE_URL: requiredString,

  /** Enoki sponsor API secret — signs sponsored transactions. */
  ENOKI_SECRET_KEY: requiredString,

  /** Internal shared secret with t2000 cron for `/api/internal/notification-users` + `/api/internal/health-factor` reads. */
  T2000_INTERNAL_KEY: requiredString,

  /** Upstash Redis URL — session storage for the engine. */
  UPSTASH_REDIS_REST_URL: requiredString,

  /** Upstash Redis token. */
  UPSTASH_REDIS_REST_TOKEN: requiredString,

  // ── Optional: feature gracefully degrades / has a default ─────────────
  /** LLM model override — defaults to claude-sonnet-4-6 if unset. */
  AGENT_MODEL: optionalString,

  /** Override for the audric-internal API base URL — defaults to NEXT_PUBLIC_APP_URL. */
  AUDRIC_INTERNAL_API_URL: optionalString,

  /** Brave Search API key — powers `web_search` tool. Tool returns "no results" gracefully if unset. */
  BRAVE_API_KEY: optionalString,

  /** Vercel cron auth shared secret — only needed in production. */
  CRON_SECRET: optionalString,

  /** OpenAI Whisper API key — STT for voice mode. Voice feature off if unset. */
  OPENAI_API_KEY: optionalString,

  /** ElevenLabs API key — TTS for voice mode. Voice feature off if unset. */
  ELEVENLABS_API_KEY: optionalString,

  /** ElevenLabs voice ID — defaults to Rachel (US English, multilingual). */
  ELEVENLABS_VOICE_ID: optionalString,

  /** Internal API key for service gateway auth — only needed for the MPP services route. */
  INTERNAL_API_KEY: optionalString,

  /** Override Sui RPC URL — defaults to BlockVision-routed mainnet. */
  SUI_RPC_URL: optionalString,

  /**
   * SPEC 10 Audric Passport custody keypair — Bech32-encoded suiprivkey
   * for the address that owns the `audric.sui` parent NFT
   * (`0xaca29165…23d11` per RUNBOOK §1). Loaded by `/api/identity/reserve`
   * to sign leaf-mint PTBs server-side; never leaves the route.
   *
   * **Required as of S.69 follow-up (2026-05-05).** Promoted from
   * `optionalString` after a 2-step diagnosis cycle confirmed:
   *   1. The Vercel-stored value reaches Node runtime and decodes to
   *      the correct custody address (verified via the temporary
   *      `/api/internal/env-diagnostic` route, since deleted).
   *   2. The first promotion attempt (commit b31e33f) failed at build
   *      because the var was originally configured as a Vercel
   *      "Sensitive" env var, which Vercel intentionally does NOT
   *      inject into the BUILD container (only the runtime container).
   *      Next.js's "Collecting page data" build phase imports every
   *      route → triggers env.ts at module-init → `requiredString`
   *      threw → build failed. Resolved by re-creating the var as a
   *      regular (non-Sensitive) env var in Vercel, which gets injected
   *      into both build and runtime containers like every other secret
   *      in this schema.
   *
   * Boot-fails the app at first import if the value is missing, empty,
   * or whitespace — the same gate that catches the BlockVision
   * empty-string class of bug. Recovery: if the Vercel value gets nuked
   * or rotated incorrectly, the symptom is "audric won't boot" (operator
   * sees env-gate error block immediately) rather than "feature silently
   * degrades for 4 days" (the original incident class).
   *
   * **Operational rule for future secret-grade env vars** (parent NFT
   * key, future signing keys, future custody artifacts): store as
   * REGULAR env vars, not Sensitive. The marginal Sensitive protections
   * (encrypted at rest, dashboard hide, log redaction) are real but
   * small for a single-operator deployment, and they trade off against
   * the env-gate model that catches misconfig at boot time. If a future
   * "tighten secrets" pass moves toward Sensitive across the board,
   * env.ts needs a `runtimeRequiredString` variant that's optional
   * during `phase-production-build` but required at runtime — see
   * audric-build-tracker.md S.69 follow-up for the design sketch.
   */
  AUDRIC_PARENT_NFT_PRIVATE_KEY: requiredString,

  /** Comma-separated session-id prefixes that mark synthetic/bot traffic. */
  SYNTHETIC_SESSION_PREFIXES: optionalString,

  /**
   * [SPEC 7 P2.7] Break-glass disable for Payment Intent multi-write
   * compiled transactions. Set to "1" / "true" to make
   * `/api/transactions/prepare` reject every `type: 'bundle'` request
   * with a 503, forcing the client to error-out cleanly. The user sees
   * a one-time message ("Payment Intents temporarily disabled — please
   * retry one operation at a time") and can re-prompt the LLM, which
   * will emit single-write `pending_action`s naturally on the next turn.
   *
   * NOTE: env var name retained as `PAYMENT_STREAM_DISABLE` for operator
   * compatibility (Vercel env var rename would require a coordinated
   * dashboard + code change — operator-facing identifier, not user-facing).
   *
   * Server-side (NOT NEXT_PUBLIC_*) by design — Vercel's runtime env
   * for serverless functions takes effect on the next invocation
   * (~30s), no redeploy required. NEXT_PUBLIC_* env changes need a
   * fresh build (~3 min) because Next.js statically bakes them into
   * client bundles. The break-glass needs to be FAST.
   *
   * Default OFF. Only set in Vercel when the 48h soak metrics call
   * for it (revert_rate > 5% sustained for >30 min — see
   * `spec/runbooks/RUNBOOK_spec7_p27_ramp.md` § decision matrix).
   */
  PAYMENT_STREAM_DISABLE: optionalString,

  // ── Vercel / runtime managed (always present in production, optional locally) ─
  /** NODE_ENV — Next.js sets this. */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Vercel deployment id — auto-set in Vercel, undefined locally. */
  VERCEL_DEPLOYMENT_ID: optionalString,

  /** Git commit SHA for this deploy — auto-set in Vercel. */
  VERCEL_GIT_COMMIT_SHA: optionalString,

  /** Vercel environment — preview/production/development. */
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
});

// ─── Client-side schema (NEXT_PUBLIC_*) ────────────────────────────────
// These are statically replaced into client bundles by Next.js. The
// schema validates them at server boot AND at first import in the
// browser (because the literal `process.env.NEXT_PUBLIC_X` reference in
// `runtimeEnv` becomes a string literal in the client bundle).
const clientSchema = z.object({
  /** Sui network — must be exactly 'mainnet' or 'testnet'. */
  NEXT_PUBLIC_SUI_NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),

  /** Google OAuth client id for zkLogin. */
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: requiredString,

  /** Enoki public API key (zkLogin + gas sponsorship). */
  NEXT_PUBLIC_ENOKI_API_KEY: requiredString,

  /** Public app URL — defaults to https://audric.ai. */
  NEXT_PUBLIC_APP_URL: optionalString,

  /** MPP gateway URL — defaults to https://mpp.t2000.ai. */
  NEXT_PUBLIC_GATEWAY_URL: optionalString,

  /** Deployment id surfaced to client (for the version-check banner). */
  NEXT_PUBLIC_DEPLOYMENT_ID: optionalString,

  /**
   * [SPEC 8 v0.5.1 B2] Feature flag for the new ReasoningTimeline UX.
   * - "1" / "true" → render the chronological timeline (B2.2 renderer)
   * - undefined / anything else → render today's ReasoningAccordion
   * Default OFF. Per-session pinning lands in B3 (harnessVersion on the
   * Upstash session record); B2 uses a global flag for staged rollout.
   */
  NEXT_PUBLIC_INTERACTIVE_HARNESS: optionalString,

  /**
   * [SPEC 15 Phase 2 / 2026-05-04] Frontend-render gate for confirm
   * chips ("Confirm" / "Cancel" buttons under multi-write plan
   * messages). When unset/empty, the plan UI behaves exactly like
   * Phase 1+1.5 today (free-text input only). When set to "1" / "true",
   * `<ConfirmChips />` renders below assistant turns whose SSE stream
   * included an `expects_confirm` event.
   *
   * **Scope:** FRONTEND-RENDER ONLY. The backend (decorator, SSE
   * emission, chip POST handling) ships unflagged so we collect
   * baseline `audric.confirm_flow.expects_confirm_set` telemetry
   * BEFORE the UI renders chips. That baseline tells us "how often
   * WOULD chips have rendered" — pre-launch sanity check.
   *
   * Default OFF. Founder workflow:
   *   Day 1 — set to "1" in dev / preview; verify chip renders + dispatches end-to-end
   *   Day 2 — set to "1" in production; monitor `audric.confirm_flow.dispatch_count{via=chip}`
   *   Rollback path: unset (falls back to free-text confirm).
   *
   * Per-session pinning is NOT done here — chips render based on the
   * SSE event, which the server emits unconditionally. If the flag
   * flips mid-session the next assistant turn shows the new behavior.
   * That's intentional: chip render is stateless on the client.
   */
  NEXT_PUBLIC_CONFIRM_CHIPS_V1: optionalString,

  /**
   * [SPEC 8 v0.5.1 B3.7] Graduated rollout percentage for the
   * interactive harness, evaluated ONLY when `NEXT_PUBLIC_INTERACTIVE_
   * HARNESS` is also set. Integer string in `0..100` (interpretation:
   * "X% of distinct user buckets see v2; the remainder stay on legacy").
   *
   * - undefined (default) → behave as today: flag-on means EVERY new
   *   session gets v2 (i.e. effective 100% rollout once flag is on)
   * - "10" → 10% of distinct user-address buckets see v2
   * - "50" → 50% — etc.
   * - "100" → equivalent to undefined (every bucket admitted)
   *
   * Bucketing is a deterministic FNV-1a hash of the user's
   * Sui address (or session id for unauth) modulo 100. Same user
   * always lands in the same bucket so dashboard aggregations don't
   * see a user flipping shapes mid-week. Per-session pinning (B3.3)
   * still applies — once a session is admitted, it stays v2 for its
   * lifetime even if the dial moves back later.
   *
   * Founder workflow:
   *   Day 1 — set to "10", monitor TurnMetrics 24h
   *   Day 2 — set to "50", monitor 24h
   *   Day 3 — set to "100" (or unset entirely)
   * Rollback path: set to "0" or unset `NEXT_PUBLIC_INTERACTIVE_HARNESS`.
   */
  NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT: optionalString,

  /**
   * [SPEC 9 v0.1.3 P9.6] Master rollout flag for the SPEC 9 v0.1.1
   * "today's-value" primitives still in place:
   *   - P9.2 proactive insight blocks (`<proactive>` markers in
   *     assistant text → ✦ ADDED BY AUDRIC lockup) — rendering is
   *     ALWAYS-ON, not gated by this flag
   *   - P9.4 `pending_input` inline forms (the `add_recipient`
   *     tool — shows a typed inline form when the LLM doesn't have
   *     enough input to construct a save_contact call)
   *
   * P9.3 persistent cross-turn todos was REMOVED on 2026-05-05 (see
   * audric-build-tracker.md S.64) after the smoke test showed the LLM
   * correctly routes natural prompts to existing tools (`record_advice`,
   * `savings_goal_create`) and the `Goal` table received zero
   * meaningful writes.
   *
   * - "1" / "true" → `addRecipientTool` joins the engine's tool roster.
   * - undefined / anything else → the engine still handles
   *   `pending_input` event types and `<proactive>` parsing (so stale
   *   browser tabs don't crash on a session that pre-dates the
   *   rollback), but the new tool is dormant.
   *
   * Default OFF. Per-session pinning is NOT applied — this is a global
   * flag because the gated affordance is entirely additive (no
   * in-flight session can break when the dial moves).
   */
  NEXT_PUBLIC_HARNESS_V9: optionalString,
});

// ─── Runtime env (Next.js requires literal references) ────────────────
// `process.env.NEXT_PUBLIC_X` must appear LITERALLY in source so Next.js
// can statically replace it for client bundles. Don't refactor this map
// to `Object.fromEntries` or a loop — the static replacement won't fire.
const runtimeEnv = {
  // Server
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  BLOCKVISION_API_KEY: process.env.BLOCKVISION_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  ENOKI_SECRET_KEY: process.env.ENOKI_SECRET_KEY,
  T2000_INTERNAL_KEY: process.env.T2000_INTERNAL_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  AGENT_MODEL: process.env.AGENT_MODEL,
  AUDRIC_INTERNAL_API_URL: process.env.AUDRIC_INTERNAL_API_URL,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
  SUI_RPC_URL: process.env.SUI_RPC_URL,
  AUDRIC_PARENT_NFT_PRIVATE_KEY: process.env.AUDRIC_PARENT_NFT_PRIVATE_KEY,
  SYNTHETIC_SESSION_PREFIXES: process.env.SYNTHETIC_SESSION_PREFIXES,
  PAYMENT_STREAM_DISABLE: process.env.PAYMENT_STREAM_DISABLE,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
  VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  VERCEL_ENV: process.env.VERCEL_ENV,
  // Client (NEXT_PUBLIC_*)
  NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_ENOKI_API_KEY: process.env.NEXT_PUBLIC_ENOKI_API_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL,
  NEXT_PUBLIC_DEPLOYMENT_ID: process.env.NEXT_PUBLIC_DEPLOYMENT_ID,
  NEXT_PUBLIC_INTERACTIVE_HARNESS: process.env.NEXT_PUBLIC_INTERACTIVE_HARNESS,
  NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT:
    process.env.NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT,
  NEXT_PUBLIC_CONFIRM_CHIPS_V1: process.env.NEXT_PUBLIC_CONFIRM_CHIPS_V1,
  NEXT_PUBLIC_HARNESS_V9: process.env.NEXT_PUBLIC_HARNESS_V9,
} as const;

// ─── Validate ──────────────────────────────────────────────────────────
//
// Detection: identify the actual runtime so we know which schema to
// validate against. Three runtimes matter — TWO of them are server:
//
//   1. Node.js server (next start, Vercel serverless functions, vitest)
//      → SERVER. Validate FULL schema (server + client vars).
//   2. Edge runtime (middleware, edge API routes)
//      → SERVER. Validate FULL schema. Vercel injects all env vars
//        into edge workers exactly like Node functions.
//   3. Browser client (Next.js bundle running in a tab)
//      → CLIENT. Validate ONLY the client schema; server vars are
//        stripped to `undefined` by the Next.js bundler and would all
//        spuriously fail "required" checks.
//
// Two discriminators OR'd together cover both server runtimes:
//
//   (a) `process.versions.node` is a string (e.g. "22.x") → Node.js.
//       Webpack's process polyfill does NOT set this, so it's a
//       reliable Node-vs-browser test. Vitest also satisfies this.
//
//   (b) `process.env.NEXT_RUNTIME === 'edge'` → Edge runtime. Next.js
//       statically sets this in edge bundles at build time, and Vercel
//       sets it as a real env var in the edge worker. Without this
//       branch, edge routes that read server-only vars (like
//       `/api/build-id` reading `VERCEL_DEPLOYMENT_ID`) would hit the
//       proxy guard and 500 every request. Discovered the hard way
//       in production after the v1 fix shipped.
//
// Anything else (no Node, no edge marker) is the browser client.
const isServer =
  typeof process !== 'undefined' &&
  ((typeof process.versions === 'object' &&
    process.versions !== null &&
    typeof process.versions.node === 'string') ||
    process.env?.NEXT_RUNTIME === 'edge');

// On the server, parse the FULL schema (server + client). Server vars
// must be set or boot fails.
//
// On the client, parse only the CLIENT schema. Server vars are stripped
// by Next.js's bundler to `undefined` and would otherwise produce false
// positives on every page load.
//
// Both branches produce the same TypeScript type (the full union) — the
// proxy guard at the bottom of this file enforces that client code
// can't accidentally read a server-only key (which would be `undefined`
// in the bundle anyway).
const fullSchema = z.object({ ...serverSchema.shape, ...clientSchema.shape });
const schemaToValidate = isServer ? fullSchema : clientSchema;
const parsed = schemaToValidate.safeParse(runtimeEnv);

if (!parsed.success) {
  // Build a single human-readable error block listing EVERY misconfigured
  // var (not just Zod's first). This is what makes the fix one-click —
  // operators see all the broken keys at once.
  const issues = parsed.error.issues
    .map((iss) => {
      const key = iss.path.join('.');
      return `  • ${key}: ${iss.message}`;
    })
    .join('\n');

  const settingsUrl = 'https://vercel.com/funkii/audric/settings/environment-variables';

  // Use a single multi-line error so the stack trace points at the import,
  // not at this throw — operators looking at the Vercel build log see the
  // formatted block above the trace.
  const message = [
    '',
    '═══ Invalid environment configuration ═══',
    '',
    `${parsed.error.issues.length} env var(s) are missing, empty, or invalid:`,
    '',
    issues,
    '',
    `Fix at: ${settingsUrl}`,
    '(Empty-string values count as invalid — Vercel "set but blank" is the common failure mode this gate exists to prevent.)',
    '',
    '═══════════════════════════════════════',
    '',
  ].join('\n');

  console.error(message);
  throw new Error(`Invalid environment configuration. ${parsed.error.issues.length} issue(s). See log above.`);
}

// Final exported value uses the full schema shape regardless of which
// branch we validated against. On the client, server-only keys are
// effectively `undefined` (they were stripped by the bundler before
// Zod ever saw them), and the proxy guard below makes any read of one
// throw before the undefined can leak into business logic.
type FullEnv = z.infer<typeof fullSchema>;
const parsedData: FullEnv = parsed.data as FullEnv;

// ─── Export ────────────────────────────────────────────────────────────
// Proxy guard: throws if a server-only var is read from the browser.
// Without this, accidental client-side reads silently return undefined
// (Next.js strips them at bundle time) and the bug surfaces as
// "feature mysteriously broken on client only".
const SERVER_ONLY_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'BLOCKVISION_API_KEY',
  'DATABASE_URL',
  'ENOKI_SECRET_KEY',
  'T2000_INTERNAL_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'AGENT_MODEL',
  'AUDRIC_INTERNAL_API_URL',
  'BRAVE_API_KEY',
  'CRON_SECRET',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE_ID',
  'INTERNAL_API_KEY',
  'SUI_RPC_URL',
  'AUDRIC_PARENT_NFT_PRIVATE_KEY',
  'SYNTHETIC_SESSION_PREFIXES',
  'PAYMENT_STREAM_DISABLE',
  'NODE_ENV',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_ENV',
]);

export const env = new Proxy(parsedData, {
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (!isServer && SERVER_ONLY_KEYS.has(prop)) {
      throw new Error(
        `[env] Cannot access server-only var '${prop}' from the client. ` +
          `Move this code to a server component / API route, or expose ` +
          `the value via a NEXT_PUBLIC_* var if it's truly safe to ship to the browser.`,
      );
    }
    return target[prop as keyof typeof target];
  },
}) as FullEnv;

// Re-export the parsed type so call sites can `type Env = typeof env` if they want.
export type Env = FullEnv;
