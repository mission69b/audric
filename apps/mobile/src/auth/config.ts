// Phase 0 native auth config. Every value here is PUBLIC: the OAuth client id is
// the same NEXT_PUBLIC value the web app ships, and there is NO client_secret on
// device — the secret lives only on the exchange server. Set these in
// apps/mobile/.env.local (see .env.example). Expo inlines EXPO_PUBLIC_* at build.

const required = (name: string, v: string | undefined): string => {
  if (!v) {
    throw new Error(
      `[auth/config] Missing ${name}. Set it in apps/mobile/.env.local (see .env.example).`
    );
  }
  return v;
};

/** Custom scheme the system browser hands back to (must match app.json `scheme`). */
export const APP_RETURN_URI = "audric://callback";

export const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

// The values below are read LAZILY (functions, not constants). Reading env at
// module load would run on the first import of anything in this file — which is
// pulled in by AuthProvider at app boot — so a missing .env.local would crash
// the entire app before even the __DEV__ "Skip to app" button could render. A
// teammate opening the UI in Expo Go should not need OAuth creds; only the REAL
// sign-in path does. So validate on first use, letting the app always boot.

/**
 * Google OAuth **Web** client id — MUST equal web-v3's
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID. This is the zkLogin `aud`; any other value
 * derives a different Sui address and forks the wallet.
 */
export const googleClientId = (): string =>
  required(
    "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
  );

/**
 * Base URL of the server that holds the client_secret and performs the token
 * exchange + Enoki derivation. Phase 0: the phase0-gate harness. Later: web-v3.
 */
const exchangeBase = (): string =>
  required(
    "EXPO_PUBLIC_EXCHANGE_BASE_URL",
    process.env.EXPO_PUBLIC_EXCHANGE_BASE_URL
  ).replace(/\/+$/, "");

/**
 * Where Google sends the auth code. A Google **Web** client only permits
 * http(s) redirect URIs, so this is the server's bridge endpoint; the bridge
 * 302s the code on to APP_RETURN_URI (the custom scheme) so the system browser
 * hands control back to the app.
 */
export const serverRedirectUri = (): string => `${exchangeBase()}/auth/bridge`;

/** JSON endpoint the app POSTs { code, codeVerifier, redirectUri } to. */
export const exchangeUrl = (): string => `${exchangeBase()}/exchange`;
