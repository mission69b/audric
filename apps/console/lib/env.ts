/**
 * Validated environment configuration (audric `env-validation-gate` rule).
 *
 * The console's first required env — the zkLogin auth surface (shared with
 * audric.ai via @audric/auth) + the shared Postgres (@audric/accounts). A
 * missing/empty value fails at boot (instrumentation.ts) rather than silently
 * 401'ing every sign-in (the S.20 empty-string bug class).
 *
 * Adding a var: add to the schema + `runtimeEnv` (literal `process.env.X` so
 * Next's static replacement works), then read via `env.X` — never `process.env`.
 */

import { z } from "zod";

const requiredString = z
  .string()
  .trim()
  .min(1, "must be a non-empty string (Vercel may have stored an empty value)");

// Server-only — never referenced from client components (the proxy throws).
const serverSchema = z.object({
  /** HS256 secret for minting the app session (must match audric.ai so the
   * SAME Passport identity verifies across both surfaces). */
  AUTH_SECRET: requiredString,
  /** Shared Postgres (the @audric/accounts substrate — same DB as audric.ai). */
  POSTGRES_URL: requiredString,
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
  AUTH_SECRET: process.env.AUTH_SECRET,
  POSTGRES_URL: process.env.POSTGRES_URL,
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
      "  Environment configuration is invalid (t2000 console).",
      "═══════════════════════════════════════════════════════════════",
      "",
      issues,
      "",
      "Fix in apps/console/.env.local (dev) or the Vercel env (deploy).",
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
