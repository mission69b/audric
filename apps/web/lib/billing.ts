/**
 * Central usage-billing constants for chat sessions.
 *
 * Audric used to charge $0.01/session via on-chain allowance deduction. That
 * model was retired in the simplification spec (v1.4 § Billing model change).
 * Now we count distinct chat sessions per address over a rolling 24-hour
 * window and tier the cap by Google's `email_verified` OIDC claim.
 *
 * **Verification source (PR-B2):** Google OIDC `email_verified` claim on
 * the zkLogin JWT — `true` for personal Gmail (always), depends on org
 * policy for Workspace. The previous Resend verify-link round-trip is
 * gone (entire `EmailCaptureModal` + `/api/user/email` + `/verify` flow
 * deleted). Verification is a soft proof of identity, not a payment.
 *
 * Single source of truth — imported by:
 *   - app/api/engine/chat/route.ts  (enforcement at session creation)
 *   - app/api/user/status/route.ts  (read-only display: sessionsUsed + limit)
 *
 * Tunables. Revisit when (a) > 20% of users hit the daily cap, or (b)
 * monthly Anthropic spend exceeds $500 — whichever first.
 */
export const SESSION_LIMIT_UNVERIFIED = 5;
export const SESSION_LIMIT_VERIFIED = 20;
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function sessionLimitFor(emailVerified: boolean): number {
  return emailVerified ? SESSION_LIMIT_VERIFIED : SESSION_LIMIT_UNVERIFIED;
}
