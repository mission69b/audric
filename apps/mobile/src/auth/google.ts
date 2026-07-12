import { EnokiClient } from "@mysten/enoki";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  APP_RETURN_URI,
  enokiApiKey,
  enokiNetwork,
  GOOGLE_AUTH_ENDPOINT,
  googleClientId,
  serverRedirectUri,
} from "./config";
import { savePendingAuth } from "./pending-auth";
import { createPkcePair, createState } from "./pkce";

// ~7-day signing window target (mainnet epoch ≈ 24h) — mirrors packages/auth.
const ADDITIONAL_EPOCHS = 7;

// Lets the auth session complete if the app was backgrounded during the
// browser handoff. Safe to call at module load.
WebBrowser.maybeCompleteAuthSession();

export type AuthCode = { code: string; codeVerifier: string };

export class AuthCancelled extends Error {
  constructor() {
    super("Sign-in was cancelled");
    this.name = "AuthCancelled";
  }
}

const buildQuery = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

/**
 * Opens Google in the system browser (auth-code + PKCE) and returns the code
 * plus the PKCE verifier. There is NO token exchange here: that needs the
 * client_secret and happens server-side (see exchange.ts). `response_type=code`
 * forces a Web client, which is mandatory to keep the same `aud` as the web app.
 */
export async function authorizeWithGoogle(): Promise<AuthCode> {
  const { verifier, challenge } = await createPkcePair();
  const state = createState();

  // Enoki zkLogin nonce — without this, deriveAddress salt_failure's on every sign-in.
  const keypair = new Ed25519Keypair();
  const enoki = new EnokiClient({ apiKey: enokiApiKey() });
  const { nonce, randomness, maxEpoch, estimatedExpiration } =
    await enoki.createZkLoginNonce({
      network: enokiNetwork(),
      ephemeralPublicKey: keypair.getPublicKey(),
      additionalEpochs: ADDITIONAL_EPOCHS,
    });
  await savePendingAuth({
    ephemeralSecret: keypair.getSecretKey(),
    randomness,
    maxEpoch,
    expiresAt: estimatedExpiration,
  });

  const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${buildQuery({
    client_id: googleClientId(),
    redirect_uri: serverRedirectUri(),
    response_type: "code",
    scope: "openid email",
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    prompt: "select_account",
  })}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN_URI);
  if (result.type !== "success") {
    throw new AuthCancelled();
  }

  const { queryParams } = Linking.parse(result.url);
  const err = queryParams?.error;
  if (typeof err === "string") {
    throw new Error(`Google returned error: ${err}`);
  }
  // CSRF: the redirect must echo our exact `state`. Reject a missing or forged
  // one BEFORE the code is trusted. The bridge is responsible for forwarding
  // `state` back verbatim alongside `code`.
  if (queryParams?.state !== state) {
    throw new Error("OAuth state mismatch");
  }
  const code = queryParams?.code;
  if (typeof code !== "string" || code.length === 0) {
    throw new Error("No authorization code in redirect");
  }

  return { code, codeVerifier: verifier };
}
