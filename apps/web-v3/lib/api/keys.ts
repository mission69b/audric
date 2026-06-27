import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  getApiKeyByHash,
  getCreditBalanceMicros,
  getUserById,
  touchApiKey,
} from "@/lib/db/queries";
import { isCreditConfigured } from "@/lib/stripe";

// Pro/Max are the paid tiers that may use the API (the issuance gate). The free
// tier never gets a key (`subscriptionTier === 'free'`). `proPlus` is included
// for forward-compat with the media tier.
const PAID_TIERS = new Set(["pro", "proPlus", "max"]);

/** Is this subscription tier allowed to mint + use API keys? */
export function isPaidTier(tier: string | null | undefined): boolean {
  return tier ? PAID_TIERS.has(tier) : false;
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

/** SHA-256 hex of the full secret — what we store + look up (never the secret). */
export function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export type ApiAuthResult =
  | { ok: true; userId: string; keyId: string }
  | { ok: false; response: Response };

/**
 * Authenticate an `Authorization: Bearer sk-…` request for the Private API.
 * Fails closed with OpenAI-shaped errors at every gate: bad/missing key → 401,
 * non-subscriber → 403, out of credit → 402.
 */
export async function authenticateApiKey(
  request: Request
): Promise<ApiAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(sk-[A-Za-z0-9_-]+)$/);
  if (!match) {
    return {
      ok: false,
      response: openAiError(
        401,
        "Missing or malformed API key. Pass `Authorization: Bearer sk-…`.",
        "invalid_request_error",
        "invalid_api_key"
      ),
    };
  }

  const row = await getApiKeyByHash(hashKey(match[1]));
  if (!row) {
    return {
      ok: false,
      response: openAiError(
        401,
        "Invalid API key.",
        "invalid_request_error",
        "invalid_api_key"
      ),
    };
  }

  const user = await getUserById(row.userId);
  if (!(user && isPaidTier(user.subscriptionTier))) {
    return {
      ok: false,
      response: openAiError(
        403,
        "The Private API is available on the Pro and Max plans. Upgrade at audric.ai to use your key.",
        "insufficient_quota",
        "plan_required"
      ),
    };
  }

  // Fail closed at $0 (like in-app premium). Inert when the credit rail is off.
  if (isCreditConfigured()) {
    const balance = await getCreditBalanceMicros(row.userId);
    if (balance <= 0) {
      return {
        ok: false,
        response: openAiError(
          402,
          "Insufficient credit. Top up at audric.ai to continue.",
          "insufficient_quota",
          "insufficient_credit"
        ),
      };
    }
  }

  // Best-effort last-used stamp; never blocks the request.
  touchApiKey(row.id).catch(() => {
    /* non-fatal */
  });

  return { ok: true, userId: row.userId, keyId: row.id };
}

/** OpenAI-compatible error envelope (so existing SDKs surface it correctly). */
export function openAiError(
  status: number,
  message: string,
  type: string,
  code: string
): Response {
  return Response.json(
    { error: { message, type, code, param: null } },
    { status }
  );
}
