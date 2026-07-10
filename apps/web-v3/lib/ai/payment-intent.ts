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

// ── agent_pay gate (SPEC_AGENT_COMMERCE §II.12 C2, need-first) ──────────────
//
// The store-buy tool has a different shape from send_transfer: under
// need-first routing the model OFFERS a listed service in text ("live report,
// $0.05 — want it?") and the user's agreement turn can be phrased ANY way
// ("yes" / "do the paid one" / "the radar option"). The founder's first live
// smoke proved that parsing the USER's wording for agreement is fragile by
// construction ("Do the paid Funding Radar" failed an affirmative regex and
// the tool call errored). So the gate keys on STRUCTURE, not user phrasing:
//   (a) OFFER-PENDING — the assistant's previous message named a listed
//       catalog service AND a $ price (checked against the live server-fetched
//       catalog, never trusted from the prompt) → the tool rides the user's
//       reply turn no matter how it's worded; the model decides from context
//       (a "no thanks" just isn't called on).
//   (b) explicit buy/use-a-SERVICE phrasing with no prior offer.
// DELIBERATELY NOT: bare payment verbs ("send/transfer/pay X to alice") —
// those are SENDS and open send_transfer only (S.611 injection review: a
// hostile listing named like a payment instruction must never let agent_pay
// compete with a send; the intents are separated at the toolset level).
// Misfire cost is bounded by construction: agent_pay pays ≤ $5, behind a
// tap-to-confirm card, pay-on-delivery with auto-refund, and the buy URL is
// constructed from the user-supplied seller address (never a model URL). The
// send_transfer gate (S.490) is a DIFFERENT risk class (arbitrary
// recipients) and stays strict — UNTOUCHED.

const SERVICE_VERBS =
  /\b(buy|purchase|hire|order|use|call|run|get|try|pay)\b[\s\S]{0,60}\b(agent|service|report|listing)\b/i;

export function hasAgentPayIntent(opts: {
  /** The recent user text (typically the last 1–2 user turns). */
  text: string;
  /** The PREVIOUS assistant message's text (the potential offer). */
  lastAssistantText?: string;
  /** True on a tool-approval continuation (mid-flow confirm round-trip). */
  isContinuation?: boolean;
}): boolean {
  if (opts.isContinuation) {
    return true;
  }
  if (SERVICE_VERBS.test(opts.text)) {
    return true;
  }
  // Offer-pending: the assistant just made a priced offer mentioning an agent
  // service — keep the tool available for the user's reply.
  if (opts.lastAssistantText) {
    const assistant = opts.lastAssistantText.toLowerCase();
    return /\b(agent|service)\b/.test(assistant) && /\$\s?\d/.test(assistant);
  }
  return false;
}
