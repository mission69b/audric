import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { getBlob } from "@/lib/blob";

// Authed read for PRIVATE blobs (SPEC_AUDRIC_V3 §6b). Private blobs have no
// public URL — this session-gated route streams them so `<img src>` works
// in-app. Under Phase-2 cookie auth the browser carries the session on `<img>`
// requests; the Phase-3 zkLogin header-auth swap revisits image reads (a
// header can't ride an `<img>` request — likely a short-lived signed URL).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pathname = request.nextUrl.searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
  }

  const blob = await getBlob(pathname);
  if (!blob) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(blob.body), {
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
