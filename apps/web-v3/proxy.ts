import { type NextRequest, NextResponse } from "next/server";

// Audric v3 is "try-before-signup" (ChatGPT-style): the app at `/` is usable
// ANONYMOUSLY (free model, client-only chats). So the proxy no longer forces a
// guest session — it lets everything through and lets the app gate features by
// auth state (sign-in unlocks wallet / premium models / persisted history).
// Auth itself is the zkLogin cookie minted at `/api/auth/session`.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/ping"],
};
