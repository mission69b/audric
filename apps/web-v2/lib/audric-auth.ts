/**
 * audric-auth (server) — verified zkLogin session adapter.
 *
 * Companion file: `lib/audric-auth-client.ts` (carries `'use client'`).
 *
 * --- WHY THIS FILE EXISTS (BENEFITS_SPEC v0.7c) ---
 *
 * The vendored vercel/ai-chatbot template (`107a43a`) used next-auth for
 * server-side `auth()` calls (route handlers + server actions + server
 * layouts). Audric does NOT use next-auth — it uses zkLogin, where
 * identity is established CLIENT-SIDE (Google OIDC id_token → Enoki →
 * Sui address, blob stored in `localStorage`) and reaches the server as
 * the `x-zklogin-jwt` header verified per-request via `jose` (the
 * canonical audric/web pattern from `apps/web/lib/auth.ts` +
 * `apps/web/middleware.ts`).
 *
 * Audric has NO cookie-based session and NO httpOnly session. Server
 * Components do NOT have a "current user" context the way next-auth
 * provides; the dashboard is gated CLIENT-SIDE by `AuthGuard` +
 * `useZkLogin()`. This adapter mirrors that architectural choice in
 * web-v2.
 *
 * --- PHASE 1 DAY 1c → PHASE 2 P2.0a ---
 *
 * Day 1c shipped a decode-only stub. P2.0a (this file post-port) wires
 * the full verification path from `apps/web/lib/auth.ts`:
 *  1. **Signature** — `jose.jwtVerify` against Google's JWKS. Catches
 *     forged tokens, expired signatures, wrong-issuer tokens.
 *  2. **Address derivation** — the canonical Sui address is
 *     deterministically derived from `(jwt.sub, jwt.aud, salt)` where
 *     the salt is held by Enoki. Module-scoped LRU caches `sub → address`
 *     per JWT lifetime so warm hits are zero-RTT.
 *  3. **Session shape** — `AudricSession.user.id` is now the canonical
 *     Sui address (Phase 2 contract), not the raw JWT `sub` (Day 1c
 *     placeholder).
 *
 * What this file STILL doesn't do (Phase 2+):
 *  - `authenticateRequest()` / `assertOwns()` / `assertOwnsOrWatched()`
 *    helpers — required when Phase 3 wires the first write tool with
 *    a body `address` field that needs ownership binding (IDOR gate).
 *    Port from `apps/web/lib/auth.ts` at that time, not now.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 2 P2.0a" + audric-build-tracker.md row 7t.
 * D-7 (b) "vendor-first, then strip" + D-15 ("audric-side composition layer").
 */

import { createRemoteJWKSet, type JWTVerifyResult, jwtVerify } from "jose";
import { env } from "./env";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * `'guest'` = no valid zkLogin session attached (anonymous / demo path).
 * `'regular'` = JWT verified, Sui address derived, real user.
 */
export type AudricUserType = "guest" | "regular";

/**
 * Drop-in shape for the template's `Session.user`. `id` is the canonical
 * Sui address per the audric/web pattern (post-P2.0a — Day 1c temporarily
 * used jwt.sub as a placeholder).
 */
export interface AudricSessionUser {
  email: string | null;
  /** Canonical Sui address (zkLogin-derived). */
  id: string;
  type: AudricUserType;
}

export interface AudricSession {
  user: AudricSessionUser;
}

interface JwtPayload {
  aud?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
  iss?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

/**
 * A JWT that has passed the full verification chain — signature,
 * issuer, audience, expiry — AND has a derived Sui address.
 */
export interface VerifiedJwt {
  emailVerified: boolean;
  payload: JwtPayload & { sub: string };
  /** Canonical zkLogin Sui address derived from `(sub, aud, salt)`. */
  suiAddress: string;
}

/**
 * Typed error thrown by `verifyJwt` when the JWT can't be verified or
 * the address can't be derived. `status` is the HTTP-equivalent code.
 */
export class AuthError extends Error {
  readonly status: 401 | 403 | 502;
  readonly publicMessage: string;

  constructor(status: 401 | 403 | 502, publicMessage: string) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
    this.name = "AuthError";
  }
}

// -----------------------------------------------------------------------------
// jose JWKS handle (lazy + module-scoped)
// -----------------------------------------------------------------------------
// `createRemoteJWKSet` returns a function that lazily fetches + caches
// JWKS responses. Module-scoped so all requests share the cache.
// Google rotates keys ~weekly; the JWKS helper handles cache-control
// headers automatically.

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
});

// -----------------------------------------------------------------------------
// In-memory address cache
// -----------------------------------------------------------------------------
// Maps `jwt.sub` → derived Sui address. Entry expires when the JWT
// expires. Process-scoped — Vercel serverless cold starts blow it away,
// and that's fine: a cold start costs one Enoki round-trip per active
// user. Warm hits are zero-RTT.

interface AddressCacheEntry {
  address: string;
  expiresAt: number;
}
const subToAddressCache = new Map<string, AddressCacheEntry>();

const ENOKI_BASE_URL = "https://api.enoki.mystenlabs.com/v1";

// -----------------------------------------------------------------------------
// verifyJwt — full verification + address derivation
// -----------------------------------------------------------------------------

/**
 * Verify a zkLogin JWT signature against Google's JWKS, then derive the
 * canonical Sui address (cached or via Enoki). Throws `AuthError` on
 * any failure.
 *
 * @param jwt The raw JWT string from the `x-zklogin-jwt` header.
 * @throws `AuthError(401)` when JWT is missing/invalid/expired/wrong-issuer.
 * @throws `AuthError(502)` when Enoki is unreachable on cache miss.
 */
export async function verifyJwt(
  jwt: string | null | undefined
): Promise<VerifiedJwt> {
  if (!jwt) {
    throw new AuthError(401, "Authentication required");
  }

  let result: JWTVerifyResult;
  try {
    result = await jwtVerify(jwt, googleJwks, {
      // Google issues both with and without trailing `https://`. Accept both.
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    });
  } catch {
    // Generic message — never leak the specific reason (expired vs
    // wrong-aud vs bad-sig) to avoid giving attackers a probe oracle.
    throw new AuthError(401, "Invalid authentication token");
  }

  const payload = result.payload as JwtPayload;
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) {
    throw new AuthError(401, "Invalid authentication token");
  }

  const cached = subToAddressCache.get(sub);
  let suiAddress: string;
  if (cached && cached.expiresAt > Date.now()) {
    suiAddress = cached.address;
  } else {
    suiAddress = await deriveAddressFromEnoki(jwt);
    const expiresAtMs =
      (payload.exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
    subToAddressCache.set(sub, { address: suiAddress, expiresAt: expiresAtMs });
  }

  const emailVerified = payload.email_verified === true;

  return {
    payload: { ...payload, sub },
    suiAddress,
    emailVerified,
  };
}

/**
 * Server-side address derivation via Enoki's salt holder. Called only
 * on cache misses. Failures throw `AuthError(502)` so middleware can
 * distinguish transient Enoki outages from auth failures.
 */
async function deriveAddressFromEnoki(jwt: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${ENOKI_BASE_URL}/zklogin`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.NEXT_PUBLIC_ENOKI_API_KEY}`,
        "zklogin-jwt": jwt,
      },
    });
  } catch {
    throw new AuthError(502, "Address derivation service unavailable");
  }

  if (!res.ok) {
    throw new AuthError(502, "Address derivation service unavailable");
  }

  let body: { data?: { address?: unknown } };
  try {
    body = await res.json();
  } catch {
    throw new AuthError(502, "Address derivation service unavailable");
  }

  const address = body?.data?.address;
  if (typeof address !== "string" || !isValidSuiAddress(address)) {
    throw new AuthError(502, "Address derivation service unavailable");
  }
  return address;
}

/**
 * Validate a Sui address format (0x followed by 64 hex chars).
 */
export function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

// -----------------------------------------------------------------------------
// getCurrentUser — drop-in replacement for next-auth's `auth()`
// -----------------------------------------------------------------------------

/**
 * Server-side current-user resolver. Reads `x-zklogin-jwt` from the
 * incoming request headers, runs the full `verifyJwt` chain, and
 * returns an `AudricSession` whose `user.id` is the canonical Sui
 * address (NOT the raw JWT `sub` — that was the Day 1c placeholder).
 *
 * Returns `null` for any auth failure (missing header / invalid JWT /
 * Enoki unreachable). This preserves the template's nullable session
 * contract — route handlers' existing `if (!session?.user)` gates work
 * verbatim; they surface 401 via `ChatbotError("unauthorized:chat")`.
 *
 * Note: This intentionally does NOT throw on `AuthError(502)` (Enoki
 * outage). The route-level layer can re-call `verifyJwt` directly if
 * it wants the typed error (e.g. to distinguish "your auth is bad"
 * from "our auth service is down"). Most route handlers care only
 * about "is there a user or not", so returning `null` is the right
 * default.
 */
export async function getCurrentUser(): Promise<AudricSession | null> {
  // [Next 15+ / App Router] `headers()` works in Server Components, Route
  // Handlers, and Server Actions. Dynamic import keeps the bundle graph
  // honest — this module is consumed from both server and client code.
  const { headers } = await import("next/headers");
  const headerList = await headers();
  const jwt = headerList.get("x-zklogin-jwt");

  if (!jwt) {
    return null;
  }

  try {
    const verified = await verifyJwt(jwt);
    const email =
      typeof verified.payload.email === "string"
        ? verified.payload.email
        : null;
    return {
      user: {
        id: verified.suiAddress,
        email,
        type: "regular",
      },
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Route-level helpers (Session 4.5 / 2026-05-19)
// -----------------------------------------------------------------------------
// Ported from `apps/web/lib/auth.ts` (per Session 4.5 lock — extend
// `audric-auth.ts` in place rather than mirror a separate `lib/auth.ts`).
// These helpers compose `verifyJwt` into route-handler ergonomics:
//
//   - `authenticateRequest(request)` — verify the `x-zklogin-jwt` header
//     and return either `{ verified }` or `{ error: NextResponse }`. Used
//     by every `?address=`-shaped read route.
//   - `assertOwns(verified, claimed)` — second leg of defense in depth.
//     Middleware proves "the JWT is real and belongs to address X";
//     `assertOwns` proves "the resource being touched also belongs to
//     address X". Returns `null` on success.
//   - `assertOwnsOrWatched(verified, target)` — like `assertOwns` but
//     also accepts the case where `target` is in the caller's
//     `WatchAddress` watchlist. The right gate for READ-ONLY analytics
//     + portfolio routes (cf. v0.49 universal address-aware reads).
//   - `authErrorResponse(err)` — central `AuthError → NextResponse`
//     mapping so error shape stays consistent across routes.
//
// Legacy helpers from apps/web/lib/auth.ts (`decodeJwt`, `validateJwt`,
// `isJwtEmailVerified`, `validateAmount`) were NOT ported — none of the
// Session 4.5 routes use them. If a future route in web-v2 needs them,
// port-as-needed.

import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextResponseImpl } from "next/server";

/**
 * Convenience helper for route handlers: verify the request's JWT
 * (`x-zklogin-jwt` header) and return either the verified user or a
 * pre-built error response.
 *
 * ```ts
 * const auth = await authenticateRequest(request);
 * if ('error' in auth) return auth.error;
 * const ownership = assertOwns(auth.verified, address);
 * if (ownership) return ownership;
 * // … proceed with auth.verified.suiAddress as the trusted identity
 * ```
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<{ verified: VerifiedJwt } | { error: NextResponse }> {
  const jwt = request.headers.get("x-zklogin-jwt");
  try {
    const verified = await verifyJwt(jwt);
    return { verified };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: authErrorResponse(err) };
    }
    return {
      error: NextResponseImpl.json(
        { error: "Authentication failed" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Build a `NextResponse` from an `AuthError`. Centralised here so error
 * shape stays consistent across all routes.
 */
export function authErrorResponse(err: AuthError): NextResponse {
  return NextResponseImpl.json(
    { error: err.publicMessage },
    { status: err.status }
  );
}

/**
 * Reject the request with HTTP 403 when the verified caller does not
 * own the address being acted on. Returns `null` on success so the
 * call site reads `if (assertOwns(...)) return ...; // proceed`.
 *
 * This is the second leg of defense in depth (D-2 lock): middleware
 * proves "the JWT is real and belongs to address X"; per-route
 * `assertOwns` proves "the resource being touched also belongs to
 * address X". Both must hold for an IDOR-class request to succeed.
 */
export function assertOwns(
  verified: VerifiedJwt,
  claimedAddress: string
): NextResponse | null {
  if (
    typeof claimedAddress !== "string" ||
    !isValidSuiAddress(claimedAddress)
  ) {
    return NextResponseImpl.json({ error: "Invalid address" }, { status: 400 });
  }
  if (verified.suiAddress !== claimedAddress) {
    return NextResponseImpl.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Like `assertOwns`, but also accepts the case where the caller has
 * `targetAddress` in their `WatchAddress` watch-list (saved contact /
 * watched wallet). This is the right gate for READ-ONLY analytics +
 * portfolio routes that legitimately serve a watched address — the
 * `v0.49 universal address-aware reads` flag in those routes.
 *
 * SPEC 30 Phase 1A.5 — closes the unauthenticated-read class. Pre-fix
 * those routes accepted `?address=anyone` with no auth; this helper
 * is the structural fix.
 *
 * Returns `null` on success. Returns 400 when the address is
 * malformed, 403 when the caller doesn't own the target AND it isn't
 * in their watchlist.
 *
 * Performance: the watch-list check is a single indexed Prisma lookup
 * (~5-15ms) and runs only when ownership doesn't already match — so
 * for the common "user reads their own data" path the cost is zero.
 */
export async function assertOwnsOrWatched(
  verified: VerifiedJwt,
  targetAddress: string
): Promise<NextResponse | null> {
  if (typeof targetAddress !== "string" || !isValidSuiAddress(targetAddress)) {
    return NextResponseImpl.json({ error: "Invalid address" }, { status: 400 });
  }
  if (verified.suiAddress === targetAddress) {
    return null;
  }

  // Lazy import: most routes that call this helper are read-heavy and
  // the Prisma client is already eagerly imported by their data path.
  const { prisma } = await import("./prisma");
  const user = await prisma.user.findUnique({
    where: { suiAddress: verified.suiAddress },
    select: {
      id: true,
      watchAddresses: {
        where: { address: targetAddress },
        select: { id: true },
      },
    },
  });

  if (!user || user.watchAddresses.length === 0) {
    return NextResponseImpl.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// -----------------------------------------------------------------------------
// Test seam — Vitest tests can override the address cache or pre-seed it.
// -----------------------------------------------------------------------------

export const __testHelpers = {
  clearAddressCache: () => subToAddressCache.clear(),
  seedAddressCache: (sub: string, address: string, expiresAtMs: number) =>
    subToAddressCache.set(sub, { address, expiresAt: expiresAtMs }),
};
