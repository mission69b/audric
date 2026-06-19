import "server-only";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExportedSessionKey } from "@mysten/seal";
import { env } from "@/lib/env";
import { sealFetch, sealStore } from "@/lib/seal";

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

// --- Walrus+Seal backend (decentralized, owner-encrypted) ---
//
// A Walrus ref encodes both ids we need: `walrus:<blobId>:<blobObjectId>` —
// blobId reads the bytes, blobObjectId deletes the (deletable) blob.
const WALRUS_PREFIX = "walrus:";

function useWalrus(): boolean {
  return env.STORAGE_BACKEND === "walrus";
}

export function isWalrusRef(ref: string): boolean {
  return ref.startsWith(WALRUS_PREFIX);
}

function makeWalrusRef(blobId: string, blobObjectId: string): string {
  return `${WALRUS_PREFIX}${blobId}:${blobObjectId}`;
}

/** Parse a `walrus:<blobId>:<blobObjectId>` ref into its parts. */
export function parseWalrusRef(ref: string): {
  blobId: string;
  blobObjectId: string;
} {
  const rest = ref.slice(WALRUS_PREFIX.length);
  const sep = rest.indexOf(":");
  return sep === -1
    ? { blobId: rest, blobObjectId: "" }
    : { blobId: rest.slice(0, sep), blobObjectId: rest.slice(sep + 1) };
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
  options?: { contentType?: string; owner?: string }
): Promise<PutBlobResult> {
  const body = toBuffer(data);
  const contentType = options?.contentType ?? "application/octet-stream";

  // Walrus+Seal: encrypt to the owner + store the ciphertext on Walrus. The
  // returned `url`/`pathname` IS the walrus ref — display goes through the
  // session-keyed decrypt route (not a plain GET), so we don't hand back the
  // in-app GET URL here.
  if (useWalrus() && options?.owner) {
    const { blobId, blobObjectId } = await sealStore(
      options.owner,
      new Uint8Array(body)
    );
    const ref = makeWalrusRef(blobId, blobObjectId);
    return { pathname: ref, url: ref, contentType };
  }

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
  if (isWalrusRef(pathname)) {
    // Walrus blobs are Seal-encrypted — they need the user's SessionKey to
    // decrypt. Callers must use getBlobViaSeal (a plain GET can't carry one).
    throw new Error("Walrus blob requires getBlobViaSeal (session-keyed)");
  }
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

/**
 * Read a blob, decrypting Walrus+Seal refs with the user's session key.
 * Non-walrus refs fall through to the normal getBlob. The caller supplies the
 * contentType (Walrus stores raw bytes; the type lives in the attachment row).
 */
export async function getBlobViaSeal(
  ref: string,
  owner: string,
  exported: ExportedSessionKey,
  contentType = "application/octet-stream"
): Promise<BlobReadResult> {
  if (!isWalrusRef(ref)) {
    return getBlob(ref);
  }
  const { blobId } = parseWalrusRef(ref);
  const bytes = await sealFetch(owner, exported, blobId);
  return { body: Buffer.from(bytes), contentType };
}

export async function deleteBlob(pathname: string): Promise<void> {
  if (isWalrusRef(pathname)) {
    // Walrus blobs are `deletable`; proper on-chain delete (by blobObjectId)
    // lands with the deletion surface wiring. They also expire after the
    // storage epochs, so an un-deleted blob is bounded, not permanent.
    return;
  }
  if (isVercelBlobEnabled()) {
    const { del } = await import("@vercel/blob");
    await del(pathname);
    return;
  }
  const filePath = localFilePath(pathname);
  await unlink(filePath).catch(() => undefined);
  await unlink(`${filePath}.meta.json`).catch(() => undefined);
}
