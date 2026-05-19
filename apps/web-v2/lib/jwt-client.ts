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
