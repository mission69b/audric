import { waitUntil } from "@vercel/functions";
import { type NextRequest, NextResponse } from "next/server";
import {
  deriveAddress,
  mintSessionToken,
  SESSION_COOKIE,
  verifyGoogleJwt,
} from "@/lib/audric-auth";
import {
  attributeReferral,
  markWelcomeSent,
  upsertUser,
} from "@/lib/db/queries";
import { EMAIL_FROM, REPLY_TO, sendEmail } from "@/lib/email/send";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { REFERRAL_COOKIE } from "@/lib/referral/constants";

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
    const { isNew, welcomeEmailSentAt } = await upsertUser(address, email);
    // Referral attribution — brand-new users only. The `?ref=` code rode in via
    // a cookie (set by <ReferralCapture/>); attribute now, clear the cookie on
    // the response below. Fire-and-forget so it never blocks/breaks sign-in;
    // the reward only fires later, on the referee's first paid action.
    const refCode = request.cookies.get(REFERRAL_COOKIE)?.value;
    if (isNew && refCode) {
      const refereeId = address;
      waitUntil(
        attributeReferral(refereeId, refCode).catch((e) =>
          console.warn("[referral] attribution failed:", e)
        )
      );
    }
    // Welcome email — exactly once per user, gated on welcomeEmailSentAt (NOT
    // `isNew`): a pre-existing row that was never welcomed (migration /
    // pre-feature sign-in / a previously-failed send) still gets one, and we
    // only stamp the timestamp once the send succeeds, so transient failures
    // self-heal on the next sign-in. Fire-and-forget (waitUntil) so a slow/
    // failed send never blocks sign-in; no-ops when RESEND_API_KEY is unset.
    if (email && !welcomeEmailSentAt) {
      const to = email;
      const userId = address;
      waitUntil(
        sendEmail({
          to,
          subject: "Welcome to Audric",
          react: WelcomeEmail({}),
          from: EMAIL_FROM.founder,
          replyTo: REPLY_TO,
        }).then((r) => {
          if (r.sent) {
            return markWelcomeSent(userId);
          }
          console.warn("[welcome email] not sent:", r.error);
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
  // Clear the referral cookie now that attribution has run.
  res.cookies.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/** DELETE — logout: clear the session cookie. */
export function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
