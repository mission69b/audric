import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { putBlob } from "@/lib/blob";

// Vision-model-supported image types. Clipboard/web pastes are frequently
// webp/gif (not just jpeg/png) — accept the full set the models can read so a
// paste doesn't hard-400.
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ACCEPTED_IMAGE_TYPES.includes(file.type), {
      message: "File type should be JPEG, PNG, WebP, or GIF",
    }),
});

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const uploadedFile = formData.get("file") as File;
    // Pasted clipboard images often arrive with an empty or odd filename →
    // sanitizing can collapse to "" and break the blob pathname. Fall back to a
    // typed default so paste always yields a valid name.
    const ext = EXT_BY_TYPE[file.type] ?? "png";
    const rawName = uploadedFile.name?.trim() || `pasted-image.${ext}`;
    const sanitized = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeName =
      sanitized.replace(/^[._]+/, "") || `pasted-image.${ext}`;
    const fileBuffer = await file.arrayBuffer();

    try {
      // Private blob via the storage seam (§6b). Returns the session-gated
      // in-app read URL — never a public vendor URL.
      const result = await putBlob(safeName, fileBuffer, {
        contentType: uploadedFile.type || "application/octet-stream",
      });

      return NextResponse.json({
        url: result.url,
        pathname: result.pathname,
        contentType: result.contentType,
        name: safeName,
      });
    } catch (_error) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
