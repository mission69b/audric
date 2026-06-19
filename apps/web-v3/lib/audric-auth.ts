import "server-only";
import { EnokiClient } from "@mysten/enoki";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { env } from "./env";

/**
 * Audric v3 server auth (zkLogin Passport).
 *
 * Model (the v3 improvement over web-v2's hourly logout):
 *  1. At sign-in the client posts the Google id_token once.
 *  2. We verify it (signature/issuer/audience) against Google's JWKS and
 *     derive the canonical Sui address via Enoki.
 *  3. We mint our OWN short app-session token (HS256 over the existing
 *     `AUTH_SECRET`, exp = the zkLogin session window ~7d) and set it as an
 *     httpOnly cookie.
 *  4. Every request carries the cookie automatically; `getCurrentUser()`
 *     verifies OUR token (fast, local) — we never re-verify the 1h Google
 *     JWT per request, so there's no hourly logout.
 *
 * The zkLogin SIGNING session (ephemeral key + proof) lives client-side
 * (localStorage) for `@t2000/sdk` writes; this file is server-auth only.
 */

export const SESSION_COOKIE = "audric_session";

export interface AudricUser {
  email: string | null;
  /** Canonical zkLogin Sui address (the Passport wallet) = the user id. */
  id: string;
}

export interface AudricSession {
  user: AudricUser;
}

// --- Google JWKS (lazy, module-scoped — shares the cache across requests) ---
const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { cooldownDuration: 30_000, cacheMaxAge: 600_000 }
);

const sessionSecret = () => new TextEncoder().encode(env.AUTH_SECRET);

export interface VerifiedGoogleJwt {
  email: string | null;
  emailVerified: boolean;
  sub: string;
}

/**
 * Verify a Google OIDC id_token (signature, issuer, audience). Throws on any
 * failure. Used ONCE at sign-in (the mint route), never per-request.
 */
export async function verifyGoogleJwt(jwt: string): Promise<VerifiedGoogleJwt> {
  const { payload } = await jwtVerify(jwt, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    algorithms: ["RS256"],
  });
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) {
    throw new Error("JWT missing sub");
  }
  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true,
  };
}

/**
 * Derive the canonical zkLogin Sui address from the verified JWT via Enoki's
 * salt holder. Server-side derivation = we never trust a client-supplied
 * address.
 */
export async function deriveAddress(jwt: string): Promise<string> {
  const client = new EnokiClient({ apiKey: env.NEXT_PUBLIC_ENOKI_API_KEY });
  const { address } = await client.getZkLogin({ jwt });
  return address;
}

/** Mint the app-session token (HS256). `expiresAtMs` = the zkLogin window. */
export async function mintSessionToken(
  user: AudricUser,
  expiresAtMs: number
): Promise<string> {
  return await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAtMs / 1000))
    .sign(sessionSecret());
}

/** Verify an app-session token; returns the user or null. */
export async function verifySessionToken(
  token: string
): Promise<AudricUser | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
    });
    const id = typeof payload.sub === "string" ? payload.sub : null;
    if (!id) {
      return null;
    }
    return {
      id,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  } catch {
    return null;
  }
}

/**
 * Server-side current user — drop-in for the template's `auth()`. Reads the
 * httpOnly session cookie and verifies our token. Returns `null` for
 * anonymous (no/invalid cookie) — anonymous is a valid state (free-model
 * trial), so callers gate features rather than hard-401 everywhere.
 */
export async function getCurrentUser(): Promise<AudricSession | null> {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const user = await verifySessionToken(token);
  return user ? { user } : null;
}
