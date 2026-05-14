import { NextRequest, NextResponse } from 'next/server';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyResult,
} from 'jose';
import { env } from './env';

/**
 * # Authentication — JWT verification + address binding
 *
 * **Why this file matters.** Pre-SPEC-30 v0.2 the auth surface here decoded
 * JWTs without verifying the signature, so any caller that produced a
 * structurally-valid JWT could impersonate any user. Combined with the
 * widespread `?address=0x...` route convention (no JWT-vs-address
 * binding), an attacker could swap the address claim and read/write
 * data for any wallet. SPEC 30 §0.1 is the live researcher report; the
 * `verifyJwt` + `assertOwns` pair below is the structural fix.
 *
 * ## Three layers of verification
 *
 * 1. **Signature** — `jose.jwtVerify` against Google's JWKS proves the
 *    JWT was actually issued by Google for our `client_id`. Catches
 *    forged tokens, expired signatures, wrong-issuer tokens.
 * 2. **Address derivation** — for zkLogin, the canonical Sui address is
 *    deterministically derived from `(jwt.sub, jwt.aud, salt)`. The
 *    salt is held by Enoki; on cache miss we fetch the address from
 *    Enoki and remember it. After warm-up, address derivation is O(1)
 *    in-memory lookup.
 * 3. **Binding** — `assertOwns(verified, claimedAddress)` rejects with
 *    HTTP 403 when the route's address claim doesn't match the JWT's
 *    derived address.
 *
 * Layers 1 + 2 happen once per JWT; layer 3 happens per-request.
 *
 * ## Backward compatibility
 *
 * The legacy `decodeJwt` / `validateJwt` helpers are PRESERVED for
 * non-IDOR routes that don't take an `address` parameter (the JWT
 * verification still happens at middleware layer for those routes
 * — see `middleware.ts`). New code MUST use `verifyJwt` + `assertOwns`.
 */

// ─── Public types ──────────────────────────────────────────────────────

interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  /**
   * Google OIDC standard claim (RFC 7519 §4.1 + Google extension). `true`
   * iff Google has verified the email address — for personal Gmail this
   * is always `true`; for Workspace it depends on the org's policy.
   * PR-B2 trusts this claim to gate the session-tier (5 vs 20 sessions/day),
   * replacing the deleted Resend-based verification flow.
   */
  email_verified?: boolean;
  /** Google OIDC standard — display name. */
  name?: string;
  /** Google OIDC standard — profile picture URL. */
  picture?: string;
}

/**
 * A JWT that has passed the full verification chain — signature, issuer,
 * audience, expiry — AND has a derived Sui address. Returned by
 * `verifyJwt` / `authenticateRequest`. Consumers that only care about
 * "does this caller own this address" should call `assertOwns` instead
 * of comparing fields by hand.
 */
export interface VerifiedJwt {
  payload: JwtPayload & { sub: string };
  /** Canonical zkLogin Sui address derived from `(sub, aud, salt)`. */
  suiAddress: string;
  emailVerified: boolean;
}

/**
 * Typed error thrown by `verifyJwt` when the JWT can't be verified or
 * the address can't be derived. `status` is the HTTP-equivalent code.
 * Callers convert to `NextResponse` via `authErrorResponse(err)`.
 */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 502,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = 'AuthError';
  }
}

// ─── jose JWKS handle (lazy + module-scoped) ──────────────────────────
// `createRemoteJWKSet` returns a function that lazily fetches + caches
// JWKS responses. Module-scoped so all requests share the cache.
// Google rotates keys ~weekly; the JWKS helper handles cache-control
// headers automatically.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
});

// ─── In-memory address cache ──────────────────────────────────────────
// Maps `jwt.sub` → derived Sui address. Entry expires when the JWT
// expires. Process-scoped — Vercel serverless cold starts blow it away,
// and that's fine: a cold start costs one Enoki round-trip per active
// user. Warm hits are zero-RTT.
//
// Why not Redis: cache hit rate per-instance is high, the value is small,
// the security model says "fail closed" so we'd rather pay the Enoki
// round-trip than serve stale data. Adding Redis adds a second failure
// mode without a meaningful win.
interface AddressCacheEntry {
  address: string;
  expiresAt: number;
}
const subToAddressCache = new Map<string, AddressCacheEntry>();

const ENOKI_BASE_URL = 'https://api.enoki.mystenlabs.com/v1';

/**
 * Verify a zkLogin JWT signature against Google's JWKS, then derive the
 * canonical Sui address (cached or via Enoki). Throws `AuthError` on
 * any failure.
 *
 * @param jwt The raw JWT string from the `x-zklogin-jwt` header.
 * @throws `AuthError(401)` when JWT is missing/invalid/expired/wrong-issuer.
 * @throws `AuthError(502)` when Enoki is unreachable on cache miss.
 */
export async function verifyJwt(jwt: string | null | undefined): Promise<VerifiedJwt> {
  if (!jwt) {
    throw new AuthError(401, 'Authentication required');
  }

  let result: JWTVerifyResult;
  try {
    result = await jwtVerify(jwt, googleJwks, {
      // Google issues both with and without trailing `https://`. Accept both.
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    });
  } catch {
    // Generic message — never leak the specific reason (expired vs
    // wrong-aud vs bad-sig) to avoid giving attackers a probe oracle.
    throw new AuthError(401, 'Invalid authentication token');
  }

  const payload = result.payload as JwtPayload;
  const sub = typeof payload.sub === 'string' ? payload.sub : null;
  if (!sub) {
    throw new AuthError(401, 'Invalid authentication token');
  }

  const cached = subToAddressCache.get(sub);
  let suiAddress: string;
  if (cached && cached.expiresAt > Date.now()) {
    suiAddress = cached.address;
  } else {
    suiAddress = await deriveAddressFromEnoki(jwt);
    const expiresAtMs = (payload.exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
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
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.NEXT_PUBLIC_ENOKI_API_KEY}`,
        'zklogin-jwt': jwt,
      },
    });
  } catch {
    throw new AuthError(502, 'Address derivation service unavailable');
  }

  if (!res.ok) {
    throw new AuthError(502, 'Address derivation service unavailable');
  }

  let body: { data?: { address?: unknown } };
  try {
    body = await res.json();
  } catch {
    throw new AuthError(502, 'Address derivation service unavailable');
  }

  const address = body?.data?.address;
  if (typeof address !== 'string' || !isValidSuiAddress(address)) {
    throw new AuthError(502, 'Address derivation service unavailable');
  }
  return address;
}

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
  request: NextRequest,
): Promise<{ verified: VerifiedJwt } | { error: NextResponse }> {
  const jwt = request.headers.get('x-zklogin-jwt');
  try {
    const verified = await verifyJwt(jwt);
    return { verified };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: authErrorResponse(err) };
    }
    return { error: NextResponse.json({ error: 'Authentication failed' }, { status: 500 }) };
  }
}

/**
 * Build a `NextResponse` from an `AuthError`. Centralised here so error
 * shape stays consistent across all routes.
 */
export function authErrorResponse(err: AuthError): NextResponse {
  return NextResponse.json({ error: err.publicMessage }, { status: err.status });
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
export function assertOwns(verified: VerifiedJwt, claimedAddress: string): NextResponse | null {
  if (typeof claimedAddress !== 'string' || !isValidSuiAddress(claimedAddress)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (verified.suiAddress !== claimedAddress) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
  targetAddress: string,
): Promise<NextResponse | null> {
  if (typeof targetAddress !== 'string' || !isValidSuiAddress(targetAddress)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (verified.suiAddress === targetAddress) return null;

  // Lazy import: most routes that call this helper are read-heavy and
  // the Prisma client is already eagerly imported by their data path.
  const { prisma } = await import('./prisma');
  const user = await prisma.user.findUnique({
    where: { suiAddress: verified.suiAddress },
    select: {
      id: true,
      watchAddresses: { where: { address: targetAddress }, select: { id: true } },
    },
  });

  if (!user || user.watchAddresses.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// ─── Legacy helpers (preserved for callers not migrated to verifyJwt) ──
// Routes that DON'T take an `address` parameter still gain protection
// from the middleware-level JWT verify. These helpers stay so we don't
// have to migrate 27 call sites in one diff. New code MUST use
// `verifyJwt` / `authenticateRequest`.

/**
 * @deprecated Decodes a JWT payload WITHOUT verifying the signature.
 * Use `verifyJwt` for any code that makes authorization decisions. This
 * helper survives only for read-only inspection (e.g. session-tier
 * resolver wants the `email_verified` claim from a JWT that has
 * already been verified at the middleware layer).
 */
export function decodeJwt(jwt: string): JwtPayload | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    );
    return payload;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use `authenticateRequest` for IDOR-prone routes (any
 * route that takes an `address` parameter). For routes whose JWT was
 * already verified at middleware layer, this helper continues to
 * provide a structural-decode shortcut.
 */
export function validateJwt(
  jwt: string | null,
): { payload: JwtPayload } | { error: NextResponse } {
  if (!jwt) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      ),
    };
  }

  const payload = decodeJwt(jwt);
  if (!payload) {
    return {
      error: NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 },
      ),
    };
  }

  return { payload };
}

/**
 * Validate a Sui address format (0x followed by 64 hex chars).
 */
export function isValidSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

/**
 * Trust the Google OIDC `email_verified` claim from the zkLogin JWT.
 *
 * PR-B2 replaces the Resend-backed email-link verification with this
 * single-claim check. Google's OIDC implementation guarantees:
 *   - personal Gmail accounts: always `email_verified: true`
 *   - Workspace accounts: depends on the org's auth policy
 *
 * Returns `false` for null / undecodable JWTs and for any payload
 * missing the claim. The session-tier resolver (`sessionLimitFor`)
 * treats `false` as "unverified" → 5 sessions/day cap.
 */
export function isJwtEmailVerified(jwt: string | null | undefined): boolean {
  if (!jwt) return false;
  const payload = decodeJwt(jwt);
  return payload?.email_verified === true;
}

const MAX_AMOUNTS: Record<string, number> = {
  save: 100_000,
  withdraw: 100_000,
  borrow: 50_000,
  repay: 100_000,
  send: 50_000,
};

/**
 * Validate transaction amount against per-flow safety caps.
 */
export function validateAmount(
  flow: string,
  amount: number,
): { valid: true } | { valid: false; reason: string } {
  if (!Number.isFinite(amount) || amount < 0) {
    return { valid: false, reason: 'Amount must be a positive number' };
  }

  const max = MAX_AMOUNTS[flow];
  if (max && amount > max) {
    return { valid: false, reason: `Amount exceeds maximum of $${max.toLocaleString()} for ${flow}` };
  }

  return { valid: true };
}

// ─── Test seam ────────────────────────────────────────────────────────
// Vitest tests can override the address cache or pre-seed it. Not
// exported through the package barrel; only the test file imports it.
export const __testHelpers = {
  clearAddressCache: () => subToAddressCache.clear(),
  seedAddressCache: (sub: string, address: string, expiresAtMs: number) =>
    subToAddressCache.set(sub, { address, expiresAt: expiresAtMs }),
};
