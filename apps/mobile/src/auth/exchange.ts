import { exchangeUrl, serverRedirectUri } from "./config";
import type { AuthCode } from "./google";

export type DerivedIdentity = {
  address: string;
  email: string | null;
  aud: string;
  /** true iff the id_token's aud equals the Web client id (no wallet fork). */
  audMatch: boolean;
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
  const res = await fetch(exchangeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier,
      redirectUri: serverRedirectUri(),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    address?: string;
    email?: string | null;
    aud?: string;
    audMatch?: boolean;
    error?: string;
  };

  if (!res.ok || !data.address) {
    throw new Error(data.error ?? `Exchange failed (${res.status})`);
  }

  return {
    address: data.address,
    email: data.email ?? null,
    aud: data.aud ?? "",
    audMatch: Boolean(data.audMatch),
  };
}
