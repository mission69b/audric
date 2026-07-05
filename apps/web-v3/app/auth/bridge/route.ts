// Alias of the mobile-auth bridge at the redirect URI funkii already registered
// in the Google Console ("/auth/bridge"), so native sign-in can be tested before
// the canonical "/api/mobile-auth/bridge" URI is added there. The handler is
// path-independent (it only 302s Google's code+state on to audric://callback),
// so we re-export it verbatim — no logic duplication. Pair with the server env
// MOBILE_AUTH_BRIDGE_PATH=/auth/bridge (so the exchange rebuilds the SAME
// redirect_uri) and the app's EXPO_PUBLIC_BRIDGE_URL. Remove both once the
// canonical URI is registered.
export { GET } from "@/app/api/mobile-auth/bridge/route";
