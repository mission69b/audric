import "server-only";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Private blob storage seam (SPEC_AUDRIC_V3 §6b).
//
// One abstraction over the blob backend so the artifact / upload surfaces never
// bind to a vendor — Walrus + Seal is the post-launch swap behind this same
// interface (decided S.474/S.475; Vercel Blob private at launch). Every blob is
// PRIVATE: nothing is served from a public URL. Reads go through the authed
// `/api/files/blob` route; the seam returns the in-app read URL, never a vendor
// URL.
//
// Backend selection:
//   - `BLOB_READ_WRITE_TOKEN` present → Vercel Blob, `access: 'private'`.
//   - otherwise               → a local filesystem store (`.blob-store/`),
//                               for dev / CI / contributors without a token.
//
// NOTE (Phase 4): handing a private blob to an external fetcher (a vision model)
// needs a short-lived signed URL (`presignUrl`) or base64 inlining at send time
// — the in-app `url` here is session-gated and NOT model-fetchable by design.

const LOCAL_DIR = join(process.cwd(), ".blob-store");

function isVercelBlobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export type PutBlobResult = {
  /** Stable backend ref — persist THIS (not the URL). */
  pathname: string;
  /** Session-gated in-app read URL for display (`<img src>`). */
  url: string;
  contentType: string;
};

export type BlobReadResult = {
  body: Buffer;
  contentType: string;
} | null;

/** The authed, in-app read URL for a stored blob (never a public vendor URL). */
function inAppReadUrl(pathname: string): string {
  return `/api/files/blob?pathname=${encodeURIComponent(pathname)}`;
}

function withRandomSuffix(pathname: string): string {
  const suffix = randomBytes(8).toString("hex");
  const dot = pathname.lastIndexOf(".");
  return dot === -1
    ? `${pathname}-${suffix}`
    : `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`;
}

/** Resolve a local path, stripping traversal segments. */
function localFilePath(pathname: string): string {
  const safe = pathname
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  return join(LOCAL_DIR, safe);
}

function toBuffer(data: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return data instanceof ArrayBuffer
    ? Buffer.from(new Uint8Array(data))
    : Buffer.from(data);
}

export async function putBlob(
  pathname: string,
  data: ArrayBuffer | Buffer | Uint8Array,
  options?: { contentType?: string }
): Promise<PutBlobResult> {
  const body = toBuffer(data);
  const contentType = options?.contentType ?? "application/octet-stream";

  if (isVercelBlobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, body, {
      access: "private",
      addRandomSuffix: true,
      contentType,
    });
    return {
      pathname: blob.pathname,
      url: inAppReadUrl(blob.pathname),
      contentType,
    };
  }

  const stored = withRandomSuffix(pathname);
  const filePath = localFilePath(stored);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  await writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType }));
  return { pathname: stored, url: inAppReadUrl(stored), contentType };
}

export async function getBlob(pathname: string): Promise<BlobReadResult> {
  if (isVercelBlobEnabled()) {
    const { get } = await import("@vercel/blob");
    const result = await get(pathname, { access: "private" });
    if (result?.statusCode !== 200) {
      return null;
    }
    const body = Buffer.from(await new Response(result.stream).arrayBuffer());
    return {
      body,
      contentType: result.blob.contentType ?? "application/octet-stream",
    };
  }

  const filePath = localFilePath(pathname);
  if (!existsSync(filePath)) {
    return null;
  }
  const body = await readFile(filePath);
  let contentType = "application/octet-stream";
  try {
    const meta = JSON.parse(
      await readFile(`${filePath}.meta.json`, "utf-8")
    ) as {
      contentType?: string;
    };
    if (typeof meta.contentType === "string") {
      contentType = meta.contentType;
    }
  } catch {
    // no sidecar meta → default content type
  }
  return { body, contentType };
}

export async function deleteBlob(pathname: string): Promise<void> {
  if (isVercelBlobEnabled()) {
    const { del } = await import("@vercel/blob");
    await del(pathname);
    return;
  }
  const filePath = localFilePath(pathname);
  await unlink(filePath).catch(() => undefined);
  await unlink(`${filePath}.meta.json`).catch(() => undefined);
}
