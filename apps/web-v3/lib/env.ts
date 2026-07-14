/**
 * Validated environment configuration (audric `env-validation-gate` rule).
 *
 * Lean v3 gate: validates the vars the AUTH surface (Phase 3) reads, so a
 * missing/empty value fails at boot rather than silently 401'ing every
 * sign-in (the S.20 BlockVision-empty-string bug class). The template's other
 * `process.env.X` reads (blob token, redis, gateway) stay as-is and fold
 * through the gate incrementally — same staged posture as web-v2's env.ts.
 *
 * Adding a var: add to the schema + `runtimeEnv` (literal `process.env.X` so
 * Next's static replacement works), then read via `env.X` — never `process.env`.
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

// Server-only — never referenced from client components (the proxy throws).
const serverSchema = z.object({
  /** Enoki secret key — server-side gas sponsorship (sponsor route). */
  ENOKI_SECRET_KEY: requiredString,
  /** HS256 secret for minting the ~7-day app session after the one-time
   * Google-JWT verification (kills the hourly-logout). Reuses the template's
   * existing Auth.js secret — no new var. */
  AUTH_SECRET: requiredString,
  // Private Memory (MemWal) — OPTIONAL: memory is opt-in/off-by-default, so a
  // missing value just disables the feature (no boot failure). Set all three
  // to enable. The delegate private key + account live server-side only.
  /** Ed25519 delegate private key (hex) for the Audric MemWal account. */
  MEMWAL_PRIVATE_KEY: optionalString,
  /** Walrus Memory account object ID (the single Audric-owned account). */
  MEMWAL_ACCOUNT_ID: optionalString,
  /** Relayer URL (default: https://relayer.memory.walrus.xyz). */
  MEMWAL_SERVER_URL: optionalString,
  // Credit rail (Stripe) — OPTIONAL: unset → credit features off (no boot
  // failure), same pattern as memory. The publishable key isn't needed
  // (hosted Checkout redirect). Sub Price IDs are inert until provisioned.
  /** Stripe secret key (test or live). */
  STRIPE_SECRET_KEY: optionalString,
  /** Stripe webhook signing secret (whsec_…) — verifies credit-granting events. */
  STRIPE_WEBHOOK_SECRET: optionalString,
  /** Recurring Price IDs for the subscription tiers (inert until set). */
  STRIPE_PRICE_PRO: optionalString,
  STRIPE_PRICE_MAX: optionalString,
  // Identity (@audric handles) — OPTIONAL: unset → handle minting off (resolve
  // still works). The parent-NFT custody key (Bech32 suiprivkey1…) signs the
  // gas-paid SuiNS leaf-subname mint/revoke. Server-only.
  AUDRIC_PARENT_NFT_PRIVATE_KEY: optionalString,
  // Agent ID handles (<label>.agent-id.sui) — OPTIONAL: unset → agent handle
  // minting off (the /v1/agent/handle route 503s). The agent-id parent-NFT
  // custody key (Bech32 suiprivkey1…, address 0x6988…) signs + gas-pays the
  // SuiNS leaf-subname mint. Server-only. DISTINCT from the @audric parent key.
  AGENT_ID_PARENT_NFT_PRIVATE_KEY: optionalString,
  // Vercel Cron auth — OPTIONAL. When set, Vercel sends it as a Bearer token on
  // cron invocations (e.g. the agent-directory reconcile) and the route enforces
  // it. Unset → the cron route runs unguarded (fine for dev; set it in prod).
  CRON_SECRET: optionalString,
  // web_search titles — OPTIONAL: a direct Perplexity API key. When set,
  // web_search calls Perplexity directly to get `search_results` (title + url +
  // date) so source rows show real page titles. Unset → falls back to the
  // keyless Gateway path (answer + URLs only, no titles). Server-only.
  PERPLEXITY_API_KEY: optionalString,
  // Transactional + lifecycle email (Resend) — OPTIONAL: unset → email sending
  // is a no-op (no boot failure; welcome/receipts just don't send). Server-only.
  RESEND_API_KEY: optionalString,
  // Stock data (Finnhub) — OPTIONAL: enables the free `stock_analysis` skill
  // (US-equity quote + profile + fundamentals + analyst ratings). Stocks have no
  // reliable keyless feed (Yahoo/Stooq are server-blocked), so this is the one
  // data skill that needs a key. Unset → the skill returns a graceful "not
  // configured" notice (no boot failure). Free tier ≈ 60 req/min. Server-only.
  FINNHUB_API_KEY: optionalString,
  // Crypto market data (CoinMarketCap Pro) — OPTIONAL: when set, the crypto
  // skills (crypto_market + price history) route through CMC (canonical quotes,
  // OHLCV, categories/trending; commercial-use Startup tier). Unset → they fall
  // back to the keyless CoinGecko / GeckoTerminal path (no boot failure). The same
  // key later powers the t2000 agent gateway (dual-use). Server-only.
  CMC_API_KEY: optionalString,
  // OPTIONAL kill switch: set to "0" or "off" to disable the whole surface
  // (no catalog block, no tool, no offers) without a code change. Unset/other
  // → enabled. Server-only.
  // Ambient search images (Brave Image Search) — OPTIONAL: web_search fetches a
  // handful of related images (safesearch strict) in parallel with the Sonar
  // call for the answer's image strip. Our Perplexity tier doesn't return
  // `return_images`, so Brave is the image source; DIRECT key by design (never
  // via the t2000 gateway — that rail is x402-metered for agents). Unset → no
  // image strip (no boot failure). Server-only.
  BRAVE_API_KEY: optionalString,
  // Image super-resolution (fal.ai) — OPTIONAL: enables the `upscale_image` tool
  // (fal `clarity-upscaler`, image→image — not on the Vercel Gateway's text→image
  // surface). Unset → the tool returns a graceful "not configured" notice (no
  // boot failure). The SAME key powers the Phase-3 uncensored image set
  // (SPEC_AUDRIC_IMAGE_PIPELINE §2.2/§12) — provisioned once, reused. Server-only.
  FAL_API_KEY: optionalString,
  // Confidential inference (Phala-direct, GPU-TEE) — OPTIONAL: enables the
  // Private API's "confidential" model tier (SPEC_AUDRIC_API v1.5). Calls to
  // `phala/*` models route to inference.phala.com (OpenAI-compatible) instead of
  // the Vercel Gateway. Unset → the confidential tier is hidden (no boot
  // failure); ZDR models keep working. Server-only.
  PHALA_API_KEY: optionalString,
  // v3.0 Phase A: confidential (phala/*) calls FAIL-CLOSED if the upstream
  // attestation can't be verified — ENFORCED BY DEFAULT. Kill-switch: set to
  // "false" to fall back to observe-mode (verify + log, still serve) if Phala's
  // external attestation/verify services have an outage. Server-only.
  CONFIDENTIAL_ATTESTATION_ENFORCE: optionalString,
  // v3.0 Phase C: the deployed `confidential_anchor` Move package id + a
  // SUI-funded signer (suiprivkey1…) that pays gas to anchor receipts on Sui.
  // Both unset → POST /v1/aci/anchor degrades to 503 (no impact on serving).
  CONFIDENTIAL_ANCHOR_PACKAGE_ID: optionalString,
  CONFIDENTIAL_ANCHOR_SIGNER_KEY: optionalString,
  // Private API free tier (SPEC_INFERENCE_DEMAND Step-1 item 4) — OPTIONAL:
  // per-account daily allowance in micro-USD (e.g. "1000000" = $1.00/day) for
  // the free-tier model only. Unset/0 → the free tier is OFF (every model
  // stays fully metered; no behavior change). A cost-envelope dial, never a
  // marketed token number. Server-only.
  FREE_TIER_DAILY_MICROS: optionalString,
});

// NEXT_PUBLIC_* — statically replaced into client bundles; validated both at
// server boot and at first client import.
const clientSchema = z.object({
  /** Google OAuth client id for zkLogin (JWT audience + the OAuth flow). */
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: requiredString,
  /** Enoki publishable key — client salt/address + ZK proof; also used
   * server-side for address derivation. */
  NEXT_PUBLIC_ENOKI_API_KEY: requiredString,
  /** Sui network — `mainnet` | `testnet` | `devnet`. */
  NEXT_PUBLIC_SUI_NETWORK: requiredString,
  /** Stripe publishable key (pk_…) — OPTIONAL: enables the native in-app billing
   * UI (Payment Element for adding/updating cards). Unset → the embedded card
   * flow is hidden; invoices/plan/cancel still work (server-side). */
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
});

// Literal references — required for Next's static replacement.
const runtimeEnv = {
  ENOKI_SECRET_KEY: process.env.ENOKI_SECRET_KEY,
  AUTH_SECRET: process.env.AUTH_SECRET,
  MEMWAL_PRIVATE_KEY: process.env.MEMWAL_PRIVATE_KEY,
  MEMWAL_ACCOUNT_ID: process.env.MEMWAL_ACCOUNT_ID,
  MEMWAL_SERVER_URL: process.env.MEMWAL_SERVER_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
  STRIPE_PRICE_MAX: process.env.STRIPE_PRICE_MAX,
  AUDRIC_PARENT_NFT_PRIVATE_KEY: process.env.AUDRIC_PARENT_NFT_PRIVATE_KEY,
  AGENT_ID_PARENT_NFT_PRIVATE_KEY: process.env.AGENT_ID_PARENT_NFT_PRIVATE_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
  CMC_API_KEY: process.env.CMC_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  FAL_API_KEY: process.env.FAL_API_KEY,
  PHALA_API_KEY: process.env.PHALA_API_KEY,
  CONFIDENTIAL_ATTESTATION_ENFORCE:
    process.env.CONFIDENTIAL_ATTESTATION_ENFORCE,
  CONFIDENTIAL_ANCHOR_PACKAGE_ID: process.env.CONFIDENTIAL_ANCHOR_PACKAGE_ID,
  CONFIDENTIAL_ANCHOR_SIGNER_KEY: process.env.CONFIDENTIAL_ANCHOR_SIGNER_KEY,
  FREE_TIER_DAILY_MICROS: process.env.FREE_TIER_DAILY_MICROS,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_ENOKI_API_KEY: process.env.NEXT_PUBLIC_ENOKI_API_KEY,
  NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
};

const isServer =
  typeof process !== "undefined" &&
  (typeof process.versions?.node === "string" ||
    process.env?.NEXT_RUNTIME === "edge");

const fullSchema = z.object({ ...serverSchema.shape, ...clientSchema.shape });
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
      "  Environment configuration is invalid (Audric v3).",
      "═══════════════════════════════════════════════════════════════",
      "",
      issues,
      "",
      "Fix in apps/web-v3/.env.local (dev) or Vercel env (deploy).",
      "═══════════════════════════════════════════════════════════════",
      "",
    ].join("\n")
  );
}

type FullEnv = z.infer<typeof fullSchema>;
const parsedData = parsed.data as FullEnv;
const SERVER_ONLY_KEYS = new Set<string>(Object.keys(serverSchema.shape));

/** Validated, typed env handle. Server-only vars throw on client access. */
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
