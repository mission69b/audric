import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { ZkProof } from "@/lib/wallet/keys";
import { loadPendingAuth } from "@/auth/pending-auth";
import { exchangeUrl, serverRedirectUri } from "./config";
import type { AuthCode } from "./google";

export type DerivedIdentity = {
  address: string;
  email: string | null;
  aud: string;
  /** true iff the id_token's aud equals the Web client id (no wallet fork). */
  audMatch: boolean;
  /** The minted `audric_session` token — authenticates the data routes. */
  token: string;
  /** Epoch ms when the session token expires (7-day cap, server-set). */
  expiresAt: number;
  /** The zkLogin proof, present only when the pending nonce inputs were sent. */
  proof?: ZkProof;
  /** The maxEpoch bound into the proof — required alongside `proof` to sign. */
  maxEpoch?: number;
};

/**
 * Sends the auth code + PKCE verifier to the exchange server, which holds the
 * client_secret, swaps the code for an id_token, verifies `aud == web client`,
 * and derives the canonical Sui address via Enoki. The app never sees the
 * client_secret and never derives the address itself.
 */
export async function exchangeForAddress({
  code,
  codeVerifier,
}: AuthCode): Promise<DerivedIdentity> {
  // When a pending zkLogin handoff exists, derive its ephemeral PUBLIC key
  // (never the secret) and send the nonce inputs so the server can mint a
  // zkLogin proof alongside the identity. Old-shape callers (no pending)
  // keep sending exactly the old body via the spread below.
  const pending = await loadPendingAuth();
  const ephemeralPublicKey = pending
    ? Ed25519Keypair.fromSecretKey(pending.ephemeralSecret).getPublicKey().toBase64()
    : undefined;

  const res = await fetch(exchangeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier,
      redirectUri: serverRedirectUri(),
      ...(pending
        ? {
            ephemeralPublicKey,
            randomness: pending.randomness,
            maxEpoch: pending.maxEpoch,
          }
        : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    address?: string;
    email?: string | null;
    aud?: string;
    audMatch?: boolean;
    token?: string;
    expiresAt?: number;
    proof?: unknown;
    maxEpoch?: number;
    error?: string;
  };

  // A session with no token can't authenticate the data routes, so treat a
  // missing token as a failed sign-in (the exchange always mints one).
  if (!res.ok || !data.address || !data.token) {
    throw new Error(data.error ?? `Exchange failed (${res.status})`);
  }

  return {
    address: data.address,
    email: data.email ?? null,
    aud: data.aud ?? "",
    audMatch: Boolean(data.audMatch),
    token: data.token,
    expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : 0,
    proof: data.proof as ZkProof | undefined,
    maxEpoch: data.maxEpoch,
  };
}
