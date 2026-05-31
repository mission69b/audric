/**
 * Client-safe JWT claim reader.
 *
 * Ported from `apps/web/lib/jwt-client.ts`. Reads `email` or `name` claims
 * from the zkLogin JWT without verifying the signature (server routes
 * verify via `lib/audric-auth.ts`; this client helper only surfaces
 * human-readable identifiers for the UI).
 */

export type JwtClaim = "email" | "name";

export function decodeJwtClaim(
  jwt: string | null | undefined,
  claim: JwtClaim
): string | null {
  if (!jwt) {
    return null;
  }
  try {
    const payload = jwt.split(".")[1];
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    const value = decoded[claim];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Read the numeric `exp` claim (unix *seconds*) from a zkLogin JWT.
 *
 * This is the TRUE sign-in session expiry: the Google OIDC id_token lapses
 * ~1h after issuance and the server bounces the user once it does — the
 * longer Sui-epoch (~7d) ephemeral-key window is irrelevant for staying
 * logged in. The Passport page uses this so the displayed expiry matches
 * the moment the user actually gets signed out.
 */
export function decodeJwtExp(jwt: string | null | undefined): number | null {
  if (!jwt) {
    return null;
  }
  try {
    const payload = jwt.split(".")[1];
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}
