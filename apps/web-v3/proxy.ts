import { type NextRequest, NextResponse } from "next/server";

// Audric v3 is "try-before-signup" (ChatGPT-style): the app at `/` is usable
// ANONYMOUSLY (free model, client-only chats). So the proxy no longer forces a
// guest session — it lets everything through and lets the app gate features by
// auth state (sign-in unlocks wallet / premium models / persisted history).
// Auth itself is the zkLogin cookie minted at `/api/auth/session`.
//
// HOST SPLIT (Store v2 Phase 1 step 0, S.665/S.668): this ONE app serves two
// domains from two Vercel projects — audric.ai (the product) and api.t2000.ai
// (the machine API). The api host must never render the consumer website:
//   api.t2000.ai/            → developers.t2000.ai (the API's front door)
//   api.t2000.ai/v1/*        → served (the API itself)
//   api.t2000.ai/api/*       → served (crons/internal)
//   api.t2000.ai/<anything>  → audric.ai/<anything> (it's an audric route)
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const host = request.headers.get("host") ?? "";
  if (host.startsWith("api.t2000.ai")) {
    if (
      pathname.startsWith("/v1") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/.well-known") ||
      pathname.startsWith("/ping")
    ) {
      // fall through to the shared handling below
    } else if (pathname === "/" || pathname === "") {
      return NextResponse.redirect("https://developers.t2000.ai", 308);
    } else {
      return NextResponse.redirect(
        `https://audric.ai${pathname}${search}`,
        308
      );
    }
  }

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets — the api-host rules above need to
  // see every page request; audric.ai traffic passes straight through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
