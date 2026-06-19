"use client";

/**
 * Client-side Seal SessionKey provider (Audric v3 decentralized storage).
 *
 * The user signs ONE Seal SessionKey per TTL with their zkLogin Passport key,
 * cached here (memory + localStorage). Its export is sent to the server with
 * requests that need decryption — the server is an authorized delegate that
 * Seal-decrypts the user's blobs (it never holds the key beyond the request).
 *
 * This is the single source for "give me a usable Seal session" across the
 * image-display read path + the model-vision (chat) path.
 */

import type { ExportedSessionKey } from "@mysten/seal";
import { SessionKey } from "@mysten/seal";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { loadSession, toZkLoginSigner } from "@/lib/zklogin";

const STORAGE_KEY = "audric:seal:sessionkey";
const TTL_MIN = 30;

type Session = { sk: SessionKey; exported: ExportedSessionKey };

let cached: Session | null = null;
let packageIdCache: string | null = null;

function suiClient(): SuiGrpcClient {
  return new SuiGrpcClient({
    baseUrl: "https://fullnode.mainnet.sui.io",
    network: "mainnet",
  });
}

async function getPackageId(): Promise<string> {
  if (packageIdCache) {
    return packageIdCache;
  }
  const config = (await fetch("/api/seal/config").then((r) => r.json())) as {
    configured: boolean;
    packageId: string | null;
  };
  if (!(config.configured && config.packageId)) {
    throw new Error("Seal storage is not configured");
  }
  packageIdCache = config.packageId;
  return config.packageId;
}

function loadStored(packageId: string): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const exported = JSON.parse(raw) as ExportedSessionKey;
    if (exported.packageId !== packageId) {
      return null;
    }
    // import() throws ExpiredSessionKeyError if past TTL → caught below.
    const sk = SessionKey.import(exported, suiClient());
    return { sk, exported };
  } catch {
    return null;
  }
}

/**
 * Get a live Seal SessionKey + its (transport-safe) export, signing once per
 * TTL. Reuses the in-memory / localStorage session until it expires.
 */
export async function getSealSession(): Promise<Session> {
  const packageId = await getPackageId();

  if (cached && !cached.sk.isExpired()) {
    return cached;
  }
  const stored = loadStored(packageId);
  if (stored && !stored.sk.isExpired()) {
    cached = stored;
    return stored;
  }

  const session = loadSession();
  if (!session) {
    throw new Error("Not signed in");
  }
  const sk = await SessionKey.create({
    address: session.address,
    packageId,
    ttlMin: TTL_MIN,
    suiClient: suiClient(),
  });
  const message = sk.getPersonalMessage();
  const { signature } = await toZkLoginSigner(session).signPersonalMessage(
    message
  );
  await sk.setPersonalMessageSignature(signature);

  // Spread strips Seal's non-enumerable toJSON guard so the export is
  // JSON-transportable to our delegate server.
  const exported = { ...sk.export() } as ExportedSessionKey;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exported));
  } catch {
    // localStorage unavailable (private mode) → in-memory cache still serves.
  }
  cached = { sk, exported };
  return cached;
}

/** Drop the cached Seal session (e.g. on sign-out). */
export function clearSealSession(): void {
  cached = null;
  packageIdCache = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
