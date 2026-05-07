/**
 * Shared Enoki sponsorship-error detection.
 *
 * Used by `/api/transactions/prepare` (sponsor) + `/api/transactions/execute`
 * (sponsor-execute) to consistently detect zkLogin session-expired failures
 * and surface actionable copy in the chat narration path.
 *
 * ## Why this exists (S18-F2 + S18-F7 — May 2026)
 *
 * Two distinct Enoki error codes both indicate a dead zkLogin session:
 *
 *   - `expired`     — JWT past its `exp` timestamp. User's session aged
 *                     out (typically ~24h after sign-in). Surfaced first
 *                     in the EXECUTE route (S18-F2 / audric@`05180bc`).
 *
 *   - `jwt_error`   — "no applicable key found in the JSON Web Key Set":
 *                     Google rotated a JWK and the user's JWT was signed
 *                     by the now-removed key. Surfaced in the PREPARE
 *                     route (S18-F7) — 8 production failures / 12h.
 *
 * Both fail for the same user-facing reason (sign out + sign in) and both
 * deserve identical actionable copy. Without this shared helper, the two
 * routes would drift (one might add a third code; the other might miss it).
 *
 * ## The Enoki error envelope
 *
 * Pre-S18-F2 the execute route parsed `parsed.message` directly — but
 * Enoki's actual envelope is `{ errors: [{ code, message }] }`, so
 * `parsed.message` was always `undefined` and EVERY Enoki error fell back
 * to "Execution failed (<status>)". Engine had no signal → agent narrated
 * "NAVI returned a 400 error". `parseEnokiErrorBody` extracts the right
 * field; `isExpiredSessionError` detects the recoverable session class.
 *
 * Other Enoki error codes (e.g. `invalid_signature`, `internal`) get the
 * raw `errors[0].message` surfaced verbatim — those are diagnostic-grade
 * messages that the engine can narrate as-is.
 */

export interface EnokiErrorEnvelope {
  errors?: Array<{ code?: string; message?: string }>;
  message?: string;
}

export interface ParsedEnokiError {
  /** First error code from `errors[0].code`, or undefined if not present. */
  code?: string;
  /** First error message from `errors[0].message`, falling back to legacy `parsed.message`. */
  message?: string;
}

/**
 * Actionable copy surfaced to the user when their zkLogin session is dead.
 * Single source of truth — both prepare + execute routes return this.
 */
export const SESSION_EXPIRED_USER_MESSAGE =
  'Your sign-in session has expired. Please sign out and sign back in to continue.';

/**
 * Programmatic code returned to the client. Stable contract for any client
 * code that wants to specifically detect session-expired and trigger a
 * re-auth flow (vs. the generic `error` text which is for human display).
 */
export const SESSION_EXPIRED_RESPONSE_CODE = 'session_expired';

/**
 * Parse an Enoki HTTP error response body. Defensive — invalid JSON returns
 * an empty object so the caller can fall through to a generic message.
 */
export function parseEnokiErrorBody(errorBody: string): ParsedEnokiError {
  try {
    const parsed = JSON.parse(errorBody) as EnokiErrorEnvelope;
    return {
      code: parsed.errors?.[0]?.code,
      message: parsed.errors?.[0]?.message ?? parsed.message,
    };
  } catch {
    return {};
  }
}

/**
 * Returns true if the parsed Enoki error indicates a dead zkLogin session
 * (either `expired` JWT or a `jwt_error` from JWK rotation). Both are
 * resolved by sign-out + sign-in.
 */
export function isExpiredSessionError(parsed: ParsedEnokiError): boolean {
  return parsed.code === 'expired' || parsed.code === 'jwt_error';
}
