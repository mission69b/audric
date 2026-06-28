// The zkLogin Passport SERVER auth now lives in @audric/auth (shared with
// apps/console — SPEC_T2000_API_V2 §2 / M1). Re-exported so existing
// `@/lib/audric-auth` imports keep working unchanged.
export {
  type AudricSession,
  type AudricUser,
  deriveAddress,
  getCurrentUser,
  mintSessionToken,
  SESSION_COOKIE,
  type VerifiedGoogleJwt,
  verifyGoogleJwt,
  verifySessionToken,
} from "@audric/auth/server";
