import * as Crypto from "expo-crypto";

const toBase64Url = (b64: string): string =>
  b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export type PkcePair = { verifier: string; challenge: string };

/**
 * RFC 7636 PKCE pair.
 * - verifier: hex of 32 random bytes (64 chars, all `unreserved`; no `btoa`
 *   needed — Hermes has no global Buffer and RN's btoa is not guaranteed).
 * - challenge: base64url( SHA-256(verifier) ).
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = bytesToHex(Crypto.getRandomBytes(32));
  const digestB64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return { verifier, challenge: toBase64Url(digestB64) };
}
