/**
 * Money-write intent gate (server-side) — the S.490 spontaneous-send fix.
 *
 * `send_transfer` is exposed to the model ONLY when the turn shows payment
 * intent. The incident: on an unrelated turn (an image generation), the agent
 * spontaneously proposed a 1 USDC send to a hallucinated address. Removing the
 * tool from the active set on non-payment turns makes that structurally
 * impossible — the model can't call a tool it doesn't have.
 *
 * Bias CLOSED: a false negative (a real send blocked) is recoverable — the user
 * rephrases with a clear "send …" and the gate opens; a false positive re-opens
 * the incident. Pure + dependency-free so it's unit-testable (no-autosend eval)
 * and importable from the route. This is a GATE only — it does NOT touch the
 * confirm card / client render path (that path's helper was what broke + got
 * reverted in the S.490 saga; we deliberately leave it untouched).
 */

// Verbs that signal an intent to move money. Broad on purpose: the incident
// turns (image/research/chat) carry NONE of these, so they gate closed.
const PAYMENT_VERBS = /\b(send|transfer|pay|paying|sending|remit|wire)\b/i;

export function hasPaymentIntent(opts: {
  /** The recent user text (typically the last 1–2 user turns). */
  text: string;
  /** The router's classified intent for the turn, when on Auto. */
  intent?: string;
  /** True on a tool-approval continuation (mid-flow confirm round-trip) — keep
   *  the send available so an already-initiated, user-confirmed send completes. */
  isContinuation?: boolean;
}): boolean {
  if (opts.isContinuation) {
    return true;
  }
  if (opts.intent === "money") {
    return true;
  }
  return PAYMENT_VERBS.test(opts.text);
}
