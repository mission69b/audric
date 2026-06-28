// The client-side zkLogin OAuth/session flow now lives in @audric/auth (shared
// with apps/console — SPEC_T2000_API_V2 §2 / M1). Re-exported so existing
// `@/lib/zklogin` imports keep working unchanged.
export {
  clearSession,
  completeLogin,
  type EnokiNetwork,
  isSessionExpired,
  loadSession,
  saveSession,
  startLogin,
  toZkLoginSigner,
  type ZkLoginConfig,
  type ZkLoginSession,
  type ZkLoginStep,
} from "@audric/auth/client";
