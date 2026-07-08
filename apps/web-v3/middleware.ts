import { type NextRequest, NextResponse } from "next/server";

// Host split (Store v2 Phase 1 step 0, S.665/S.668): this ONE app serves two
// domains from two Vercel projects — audric.ai (the product) and api.t2000.ai
// (the machine API). The api host must never render the consumer website:
//   api.t2000.ai/            → developers.t2000.ai (the API's front door)
//   api.t2000.ai/v1/*        → served (the API itself)
//   api.t2000.ai/api/*       → served (crons/internal)
//   api.t2000.ai/<anything>  → audric.ai/<anything> (it's an audric route)
// audric.ai requests pass through untouched.
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!host.startsWith("api.t2000.ai")) {
    return NextResponse.next();
  }
  const { pathname, search } = request.nextUrl;
  if (
    pathname.startsWith("/v1") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/.well-known")
  ) {
    return NextResponse.next();
  }
  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect("https://developers.t2000.ai", 308);
  }
  return NextResponse.redirect(
    `https://audric.ai${pathname}${search}`,
    308
  );
}

export const config = {
  // Skip static assets — they're only requested by pages, which the api host
  // never renders.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
