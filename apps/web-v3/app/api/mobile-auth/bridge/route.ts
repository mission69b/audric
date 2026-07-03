import type { NextRequest } from "next/server";

// Google OAuth bridge for the NATIVE app. A Google "Web" client only allows
// http(s) redirect URIs, never a custom scheme — so Google redirects the
// auth-code here, and we 302 it on to the app's `audric://callback`, which the
// system browser intercepts to hand control back to the app.
//
// Security (per the mobile-auth review):
//  • the return target is HARD-CODED to `audric://callback` — never a URL taken
//    from the request, so this can't be turned into an open redirect;
//  • only `code`, `state`, and a safe `error` code are forwarded — nothing else;
//  • the `code` is NOT consumed here (the app posts it to /exchange); we never
//    see or log the client_secret / tokens.

const APP_CALLBACK = "audric://callback";

export function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams;
  const out = new URLSearchParams();

  const error = src.get("error");
  const code = src.get("code");
  const state = src.get("state");

  if (error) {
    // Forward only the OAuth error CODE (a short enum like "access_denied"),
    // never Google's human-readable description (may echo attacker input).
    out.set("error", error);
  } else if (code) {
    out.set("code", code);
  } else {
    out.set("error", "invalid_request");
  }
  // `state` is the client's CSRF token — echo it back verbatim so the app can
  // match it. Absent state still forwards (the app rejects the mismatch).
  if (state) {
    out.set("state", state);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_CALLBACK}?${out.toString()}` },
  });
}
