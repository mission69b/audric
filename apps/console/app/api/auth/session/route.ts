import { db } from "@audric/accounts";
import { user } from "@audric/accounts/schema";
import {
  deriveAddress,
  mintSessionToken,
  SESSION_COOKIE,
  verifyGoogleJwt,
} from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Server-side cap on the session window (the client passes the zkLogin
// `estimatedExpiration`; we never trust a client-supplied exp beyond this).
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST { jwt, expiresAt } — the one-time Google-JWT verification + app-session
 * mint for the t2000 console. Verifies the id_token, derives the Sui address
 * (Enoki), ensures the shared user row exists, mints our HS256 session token,
 * and sets it as an httpOnly cookie scoped to platform.t2000.ai.
 *
 * The derived address is the SAME Passport identity as audric.ai (same Google
 * client + Enoki salt holder) → one account, one credit, two surfaces. The
 * Audric-only sign-in extras (referral attribution, welcome email) are NOT here
 * by design — the console just needs the row to exist.
 */
export async function POST(request: NextRequest) {
  let jwt: unknown;
  let clientExpiresAt: unknown;
  try {
    const body = await request.json();
    jwt = body.jwt;
    clientExpiresAt = body.expiresAt;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof jwt !== "string" || jwt.length === 0) {
    return NextResponse.json({ error: "Missing jwt" }, { status: 400 });
  }

  let address: string;
  let email: string | null;
  try {
    const verified = await verifyGoogleJwt(jwt);
    address = await deriveAddress(jwt);
    email = verified.emailVerified ? verified.email : null;
    // Ensure the shared user row exists (id = Passport address). Idempotent —
    // a no-op if the account already exists (e.g. signed up via audric.ai).
    await db
      .insert(user)
      .values({ id: address, email, emailVerified: email !== null })
      .onConflictDoNothing();
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const now = Date.now();
  const cap = now + MAX_SESSION_MS;
  const expiresAt =
    typeof clientExpiresAt === "number" && clientExpiresAt > now
      ? Math.min(clientExpiresAt, cap)
      : cap;

  const token = await mintSessionToken({ id: address, email }, expiresAt);

  const res = NextResponse.json({ address, email });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
  return res;
}

/** DELETE — logout: clear the session cookie. */
export function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
