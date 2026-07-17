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

// ---------------------------------------------------------------------------
// pay_service gate (the S.609 offer-pending pattern, pointed at the MPP
// catalog). The full <paid_services> block + the pay_service tool enter a
// turn only when one of these structural signals fires — the always-on
// surface is just the one-line hint + the read-only find_paid_services tool.
// ---------------------------------------------------------------------------

const SERVICE_VERBS =
  /\b(buy|purchase|hire|order|use|call|run|get|try|pay|book|search)\b[\s\S]{0,60}\b(service|api|endpoint|catalog|hotel|flight|jmpr)\b/i;

export function hasPayServiceIntent(opts: {
  /** The recent user text (typically the last 1–2 user turns). */
  text: string;
  /** The PREVIOUS assistant message's text (the potential offer). */
  lastAssistantText?: string;
  /** Display names of the catalog's listed services (live, server-fetched). */
  catalogNames?: string[];
  /** True on a tool-approval continuation (mid-flow confirm round-trip). */
  isContinuation?: boolean;
}): boolean {
  if (opts.isContinuation) {
    return true;
  }
  if (SERVICE_VERBS.test(opts.text)) {
    return true;
  }
  // Offer-pending: the assistant just made a priced offer for a real listed
  // service — keep the tool available for the user's reply, whatever its
  // wording. Structural (catalog name + price), not phrasing-based.
  if (
    opts.lastAssistantText &&
    opts.catalogNames &&
    opts.catalogNames.length > 0
  ) {
    const assistant = opts.lastAssistantText.toLowerCase();
    const namedService = opts.catalogNames.some((n) =>
      assistant.includes(n.toLowerCase())
    );
    return namedService && /\$\s?\d/.test(assistant);
  }
  return false;
}
