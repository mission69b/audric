import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { getBlobViaSeal } from "@/lib/blob";

// Session-keyed decrypt read for Walrus+Seal blobs. An `<img>` GET can't carry
// a SessionKey, so the client posts its (per-request) session export here and
// we stream back the decrypted bytes. The server is a transient delegate — it
// never persists the key.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { ref, exportedSessionKey } = (await request.json()) as {
      ref: string;
      exportedSessionKey: Parameters<typeof getBlobViaSeal>[2];
    };
    const blob = await getBlobViaSeal(ref, session.user.id, exportedSessionKey);
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
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
