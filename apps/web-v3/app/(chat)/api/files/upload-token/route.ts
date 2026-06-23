import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";

// Client-direct upload token route. Files > ~4.5MB can't go through a serverless
// function (Vercel caps the request body → 413), so the browser uploads them
// straight to Vercel Blob, authorized by a short-lived token minted here. Blobs
// stay PRIVATE (read only through the authed /api/files/blob route via get()).
//
// Small files still use /api/files/upload (server route) — it needs no Blob
// token, so tokenless local/CI dev keeps working for the common case.

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
// Private Blob stores are fine well under 100MB; 25MB covers big decks with room.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Authorize BEFORE minting a token — without this anyone could upload.
        const session = await auth();
        if (!session) {
          throw new Error("Unauthorized");
        }
        return {
          access: "private",
          addRandomSuffix: true,
          allowedContentTypes: ACCEPTED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
        };
      },
      // We resolve the attachment from the returned pathname client-side, so no
      // post-upload bookkeeping is needed here. (This callback also can't reach
      // localhost during dev — another reason not to depend on it.)
      onUploadCompleted: async () => {
        // intentionally empty
      },
    });

    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
