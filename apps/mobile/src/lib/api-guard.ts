import { verifyMobileSession } from "@/auth/session-token";

// Runtime auth for the mobile `+api` data routes — the enforcement behind the
// "⚠️ DEV TRUST MODEL" comments. Identity comes from a verified `audric_session`
// token (minted by web-v3's exchange, HS256 over the shared AUTH_SECRET), NEVER
// from a client-asserted `userId`. This replaces the old blunt `productionGate`
// (which 403'd every route in prod because there was no auth) with real auth:
// in prod a route works for a valid session and 401s otherwise.
//
// SERVER-ONLY (pulls in `session-token` → AUTH_SECRET). Import only from `+api`
// routes, never from client code.

const isProduction = () => process.env.NODE_ENV === "production";

const unauthorized = () =>
  Response.json({ error: "Unauthorized." }, { status: 401 });

export type AuthResult =
  | {
      ok: true;
      /** Verified Sui address; `null` only in the dev-guest fallback (no token). */
      userId: string | null;
      /** Verified email — present only when `viaToken` (else the route may use its body). */
      email: string | null;
      /** True when the identity came from a verified token (authoritative). */
      viaToken: boolean;
    }
  | { ok: false; response: Response };

/**
 * Resolve the caller's identity for a data route.
 *
 *  - `Authorization: Bearer <token>` present → verify it. Valid ⇒ identity is the
 *    token's `sub` (authoritative; any client-asserted id is ignored). **Invalid ⇒
 *    401** — a present-but-bad token is an attack signal, never downgraded to the
 *    dev-guest fallback, even in development.
 *  - No token, **production** ⇒ 401. Nothing unauthenticated is served in prod.
 *  - No token, **development** ⇒ fall back to `clientAssertedUserId` (the __DEV__
 *    bypass / guest persona). May be `null` ⇒ guest, so the route skips persistence.
 *
 * This preserves the exact dev/prod split the old gate drew, upgrading prod from
 * "disabled (403)" to "authenticated (401 unless a valid session)".
 */
export async function authenticate(
  request: Request,
  clientAssertedUserId: string | null
): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  if (match) {
    const user = await verifyMobileSession(match[1]);
    if (user) {
      return { ok: true, userId: user.id, email: user.email, viaToken: true };
    }
    // Present but invalid — reject outright, in every environment.
    return { ok: false, response: unauthorized() };
  }

  if (isProduction()) {
    return { ok: false, response: unauthorized() };
  }

  // Development only: trust the client-asserted id (dev bypass / guest).
  return {
    ok: true,
    userId: clientAssertedUserId,
    email: null,
    viaToken: false,
  };
}
