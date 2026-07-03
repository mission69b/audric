import { type NextRequest, NextResponse } from "next/server";
import { deriveAddress, verifyGoogleJwt } from "@/lib/audric-auth";
import { upsertUser } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { checkMobileAuthIpRateLimit, clientIp } from "@/lib/ratelimit";

// Native (mobile) Google sign-in — the secret-holding half of the flow.
//
// The web app gets its id_token in-browser and posts it straight to
// /api/auth/session. A native app can't do that with the SAME OAuth audience,
// so it runs auth-code + PKCE against the shared Web client and posts the code
// here. We swap code→id_token using the client_secret (which never leaves the
// server), then run the IDENTICAL verify + derive the web route uses — so the
// same Google account yields the same Sui address on both surfaces (no wallet
// fork). Nothing wallet-signing happens here: this returns identity only.
//
// Hardening (mobile-auth review):
//  • ignore any client-supplied redirectUri — the token-exchange redirect_uri is
//    reconstructed from THIS server's origin (the bridge), the exact value Google
//    saw, so a spoofed body can't redirect the code swap elsewhere;
//  • verifyGoogleJwt enforces `aud == NEXT_PUBLIC_GOOGLE_CLIENT_ID` (wrong client
//    id → 401), so a forked-audience token can never derive an address;
//  • never log the code, verifier, id_token, or Google's response body; return
//    generic errors only.

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const MAX_BODY_BYTES = 4096;
// Cap the outbound wait so a hung/slow Google response can't pin server
// concurrency indefinitely (a stalled connection would otherwise hold the route
// open until the platform's own, much longer, timeout).
const GOOGLE_TIMEOUT_MS = 10_000;

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

// Read the request body as text while bounding total BYTES. Streams the body and
// aborts the moment the running byte count exceeds `max`, so a chunked / unknown
// -length body can't force us to buffer arbitrary data before the check — and it
// counts real bytes, not UTF-16 code units. Returns null when over the cap.
async function readCappedText(
  request: NextRequest,
  max: number
): Promise<string | null> {
  const body = request.body;
  if (!body) {
    return "";
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let result = await reader.read();
  while (!result.done) {
    const value = result.value;
    if (value) {
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    result = await reader.read();
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export async function POST(request: NextRequest) {
  const secret = env.GOOGLE_CLIENT_SECRET;
  if (!secret) {
    // Feature-gated: the var is unset in this deployment.
    return fail(503, "Mobile sign-in is not configured");
  }

  // Per-IP throttle BEFORE any work: each accepted request fans out to Google's
  // token endpoint, so an unthrottled route lets an attacker burn concurrency +
  // outbound quota. Fails OPEN when Redis is unconfigured (local dev).
  if (!(await checkMobileAuthIpRateLimit(clientIp(request)))) {
    return fail(429, "Too many requests");
  }

  // Size cap — the body is two short strings; anything large is abuse. Reject on
  // the declared length first (cheap), then read with a BYTE-bounded stream so a
  // chunked / spoofed-length body still can't over-buffer.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return fail(413, "Payload too large");
  }

  const raw = await readCappedText(request, MAX_BODY_BYTES);
  if (raw === null) {
    return fail(413, "Payload too large");
  }

  let code: unknown;
  let codeVerifier: unknown;
  try {
    const body = JSON.parse(raw);
    code = body.code;
    codeVerifier = body.codeVerifier;
  } catch {
    return fail(400, "Bad request");
  }
  if (
    typeof code !== "string" ||
    code.length === 0 ||
    typeof codeVerifier !== "string" ||
    codeVerifier.length === 0
  ) {
    return fail(400, "Missing code or verifier");
  }

  // The redirect_uri MUST byte-match the one used in the auth request (Google
  // enforces exact equality). We rebuild it from OUR origin + the bridge path —
  // never from the request body — so it equals what Google saw and can't be
  // steered by the client.
  const redirectUri = `${request.nextUrl.origin}/api/mobile-auth/auth/bridge`;

  // 1) Swap the auth code for tokens (server-to-server, client_secret held here).
  let idToken: string;
  try {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        client_id: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        client_secret: secret,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id_token?: string;
    };
    if (!res.ok || typeof data.id_token !== "string") {
      // Do NOT surface Google's error body (may echo the code / descriptions).
      return fail(401, "Authorization exchange failed");
    }
    idToken = data.id_token;
  } catch {
    return fail(502, "Auth provider unavailable");
  }

  // 2) Verify + derive — IDENTICAL to /api/auth/session, so the address matches
  //    audric.ai exactly. verifyGoogleJwt throws on a wrong audience.
  let address: string;
  let email: string | null;
  try {
    const verified = await verifyGoogleJwt(idToken);
    address = await deriveAddress(idToken);
    email = verified.emailVerified ? verified.email : null;
  } catch {
    return fail(401, "Invalid token");
  }

  // Create the user row (id = address) so chat/history FKs resolve. Idempotent;
  // non-fatal — the app also upserts on session restore, so a transient DB blip
  // must not block sign-in.
  try {
    await upsertUser(address, email);
  } catch (e) {
    console.warn("[mobile-auth] user upsert failed (non-fatal):", e);
  }

  // `aud`/`audMatch` are retained for the client's Phase-0 parity display;
  // audMatch is necessarily true here (verifyGoogleJwt already enforced it).
  return NextResponse.json({
    address,
    email,
    aud: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    audMatch: true,
  });
}
