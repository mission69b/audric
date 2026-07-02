import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  APP_RETURN_URI,
  GOOGLE_AUTH_ENDPOINT,
  googleClientId,
  serverRedirectUri,
} from "./config";
import { createPkcePair } from "./pkce";

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

  const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${buildQuery({
    client_id: googleClientId(),
    redirect_uri: serverRedirectUri(),
    response_type: "code",
    scope: "openid email",
    code_challenge: challenge,
    code_challenge_method: "S256",
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
  const code = queryParams?.code;
  if (typeof code !== "string" || code.length === 0) {
    throw new Error("No authorization code in redirect");
  }

  return { code, codeVerifier: verifier };
}
