import "server-only";
import { EnokiClient } from "@mysten/enoki";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

/**
 * Shared server auth (zkLogin Passport) — the substrate consumed by both
 * audric/web-v3 (audric.ai) and apps/console (agents.t2000.ai). One source
 * → both surfaces derive the SAME Passport address from the SAME Google client
 * + Enoki salt holder; each app mints its own domain-scoped session cookie.
 * (SPEC_T2000_API_V2 §2 / M1.)
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
 *
 * Env: read from `process.env` directly (the shared-package convention — same
 * as `@audric/accounts`' `db.ts`). Each consuming app validates these at boot
 * via its own Zod `env.ts` gate (AUTH_SECRET, NEXT_PUBLIC_GOOGLE_CLIENT_ID,
 * NEXT_PUBLIC_ENOKI_API_KEY).
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

const sessionSecret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

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
    audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
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
  const client = new EnokiClient({
    apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "",
  });
  const { address } = await client.getZkLogin({ jwt });
  return address;
}

/**
 * Compute the zkLogin ZK proof from a verified JWT + the device's nonce inputs.
 * Runs server-side (same Enoki key as deriveAddress) so the JWT never leaves the
 * server; the proof is bound to the device's ephemeral public key via the nonce,
 * so it's unusable without the on-device ephemeral secret. Native-send only.
 */
// Cap the Enoki zkProof call so a hung/slow proving service can't pin server
// concurrency indefinitely — mirrors the sibling Google token fetch's 10s bound. The
// SDK call takes no abort signal, so race it against a timeout and clear the timer on
// whichever settles first.
const ENOKI_ZKP_TIMEOUT_MS = 10_000;

export async function createZkProof(input: {
  jwt: string;
  ephemeralPublicKey: string; // base64 of the device's Ed25519 public key
  randomness: string;
  maxEpoch: number;
  network: "mainnet" | "testnet" | "devnet";
}): Promise<ZkLoginSignatureInputs> {
  const client = new EnokiClient({
    apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "",
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Enoki zkProof timed out")),
      ENOKI_ZKP_TIMEOUT_MS
    );
  });
  try {
    const proof = await Promise.race([
      client.createZkLoginZkp({
        network: input.network,
        jwt: input.jwt,
        ephemeralPublicKey: new Ed25519PublicKey(
          fromBase64(input.ephemeralPublicKey)
        ),
        randomness: input.randomness,
        maxEpoch: input.maxEpoch,
      }),
      timeout,
    ]);
    return proof as ZkLoginSignatureInputs;
  } finally {
    clearTimeout(timer);
  }
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
