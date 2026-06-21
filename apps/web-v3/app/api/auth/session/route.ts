import { waitUntil } from "@vercel/functions";
import { type NextRequest, NextResponse } from "next/server";
import {
  deriveAddress,
  mintSessionToken,
  SESSION_COOKIE,
  verifyGoogleJwt,
} from "@/lib/audric-auth";
import { upsertUser } from "@/lib/db/queries";
import { EMAIL_FROM, REPLY_TO, sendEmail } from "@/lib/email/send";
import { WelcomeEmail } from "@/lib/email/templates/welcome";

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
    const { isNew } = await upsertUser(address, email);
    // Welcome email — exactly once, on first sign-in, only if we have a verified
    // email. Fire-and-forget (waitUntil) so a slow/failed send never blocks or
    // breaks sign-in; no-ops silently when RESEND_API_KEY is unset.
    if (isNew && email) {
      const to = email;
      waitUntil(
        sendEmail({
          to,
          subject: "Welcome to Audric",
          react: WelcomeEmail({}),
          from: EMAIL_FROM.founder,
          replyTo: REPLY_TO,
        }).then((r) => {
          if (!r.sent) {
            console.warn("[welcome email] not sent:", r.error);
          }
        })
      );
    }
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
