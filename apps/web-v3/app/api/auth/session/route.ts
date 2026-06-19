import { type NextRequest, NextResponse } from "next/server";
import {
  deriveAddress,
  mintSessionToken,
  SESSION_COOKIE,
  verifyGoogleJwt,
} from "@/lib/audric-auth";
import { upsertUser } from "@/lib/db/queries";
import { maybeBackfillHandle } from "@/lib/identity/backfill";

// Server-side cap on the session window (the client passes the zkLogin
// `estimatedExpiration`; we never trust a client-supplied exp beyond this).
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST { jwt, expiresAt } — the one-time Google-JWT verification + app-session
 * mint. Verifies the id_token, derives the Sui address (Enoki), mints our
 * HS256 session token, and sets it as an httpOnly cookie. Returns the address.
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
    // Upsert the user row (id = address) so Chat/Document FKs resolve + capture
    // the verified email (§6b).
    await upsertUser(address, email);
    // Auto-adopt a returning v2 user's @audric handle (best-effort, never throws;
    // no-op once they have a handle or if V2_DATABASE_URL is unset).
    await maybeBackfillHandle(address);
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
