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
  STRIPE_PRICE_PRO_PLUS: optionalString,
  STRIPE_PRICE_MAX: optionalString,
  // Identity (@audric handles) — OPTIONAL: unset → handle minting off (resolve
  // still works). The parent-NFT custody key (Bech32 suiprivkey1…) signs the
  // gas-paid SuiNS leaf-subname mint/revoke. Server-only.
  AUDRIC_PARENT_NFT_PRIVATE_KEY: optionalString,
  // Seal (decentralized private storage) — OPTIONAL: unset → Seal encryption
  // off (artifacts/memory stay on the current backend). The API key
  // authenticates us to the MPC committee; the package id is our on-chain policy
  // (audric_seal::seal_policy). Server-only.
  /** Seal MPC committee API key (request via the Enoki dashboard). */
  SEAL_API_KEY: optionalString,
  /** Published `audric_seal` package id (the `seal_approve` access policy). */
  SEAL_POLICY_PACKAGE_ID: optionalString,
  /** Blob backend: "walrus" → Seal-encrypted Walrus storage; unset → Vercel
   * Blob (private) / local fallback. Walrus requires Seal + the uploader key. */
  STORAGE_BACKEND: optionalString,
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
  STRIPE_PRICE_PRO_PLUS: process.env.STRIPE_PRICE_PRO_PLUS,
  STRIPE_PRICE_MAX: process.env.STRIPE_PRICE_MAX,
  AUDRIC_PARENT_NFT_PRIVATE_KEY: process.env.AUDRIC_PARENT_NFT_PRIVATE_KEY,
  SEAL_API_KEY: process.env.SEAL_API_KEY,
  SEAL_POLICY_PACKAGE_ID: process.env.SEAL_POLICY_PACKAGE_ID,
  STORAGE_BACKEND: process.env.STORAGE_BACKEND,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_ENOKI_API_KEY: process.env.NEXT_PUBLIC_ENOKI_API_KEY,
  NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
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
