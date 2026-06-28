import "server-only";

import { hashKey } from "@audric/accounts";
import {
  getApiKeyByHash,
  getCreditBalanceMicros,
  touchApiKey,
} from "@/lib/db/queries";
import { isCreditConfigured } from "@/lib/stripe";

// The key primitives (generate/hash/tier-gate) now live in @audric/accounts
// (shared with apps/console, which mints keys against the SAME hash — M1).
// Re-exported so existing `@/lib/api/keys` imports keep working unchanged.
export {
  canUseApi,
  generateApiKey,
  hashKey,
  isPaidTier,
} from "@audric/accounts";

export type ApiAuthResult =
  | { ok: true; userId: string; keyId: string }
  | { ok: false; response: Response };

/**
 * Authenticate an `Authorization: Bearer sk-…` request for the Private API.
 * Fails closed with OpenAI-shaped errors: bad/missing key → 401, out of
 * credit → 402.
 *
 * v2 gate (SPEC_T2000_API_V2 M3.6): NO plan requirement — a valid key + a
 * positive credit balance is enough, so top-up devs (no sub) can call. A paid
 * plan grants monthly credit into the same ledger, so subs pass the balance
 * check too; a sub that has exhausted its credit gets the same 402 (top up /
 * wait for renewal).
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

  // Fail closed at $0 (covers top-up devs AND subs whose credit is spent).
  // Inert when the credit rail is off (dev/unconfigured).
  if (isCreditConfigured()) {
    const balance = await getCreditBalanceMicros(row.userId);
    if (balance <= 0) {
      return {
        ok: false,
        response: openAiError(
          402,
          "Insufficient credit. Add credit or a plan at platform.t2000.ai to continue.",
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
