import { createHash, randomBytes } from "node:crypto";

// Shared API-key primitives (the substrate — SPEC_T2000_API_V2 §2). BOTH the
// console (which MINTS keys) and web-v3 (which AUTHENTICATES them at
// api.t2000.ai) must hash identically, so this lives in one place. web-v3
// re-exports these from lib/api/keys.ts; the console imports them directly.

// Pro/Max are the paid tiers that may use the API (the issuance gate). The free
// tier never gets a key. `proPlus` is included for forward-compat (media tier).
const PAID_TIERS = new Set(["pro", "proPlus", "max"]);

/** Is this subscription tier allowed to mint + use API keys? */
export function isPaidTier(tier: string | null | undefined): boolean {
  return tier ? PAID_TIERS.has(tier) : false;
}

/** SHA-256 hex of the full secret — what we store + look up (never the secret). */
export function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Mint a new secret. Returns the plaintext ONCE (shown to the user, never
 *  stored) plus the hash + display prefix we persist. */
export function generateApiKey(): {
  secret: string;
  hashedKey: string;
  keyPrefix: string;
} {
  // 32 random bytes → url-safe base64 (~43 chars). `sk-` prefix = OpenAI-style.
  const secret = `sk-${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    hashedKey: hashKey(secret),
    // Display tail only — e.g. "sk-…AbC9" (never reveals the secret).
    keyPrefix: `sk-…${secret.slice(-4)}`,
  };
}
