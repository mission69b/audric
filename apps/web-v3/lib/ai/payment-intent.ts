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
// $0.05 — want it?") and the user's agreement turn is often a bare "yes" with
// no payment verb. Gating on user phrasing alone would strip the tool exactly
// when it's needed. So the gate opens on EITHER:
//   (a) explicit buy/use-a-service phrasing (incl. all payment verbs), OR
//   (b) a short affirmative reply RIGHT AFTER the assistant named a listed
//       service with a price (the offer→agree handshake, checked structurally
//       against the live catalog — not trusted from the prompt).
// Misfire cost is bounded by construction: the tool can only pay allowlisted
// rail sellers (URL built client-side), ≤ $5, behind a tap-to-confirm card,
// pay-on-delivery with auto-refund. The send_transfer gate is UNTOUCHED.

const SERVICE_VERBS =
  /\b(buy|purchase|hire|order|use|call|run|get|try)\b[\s\S]{0,60}\b(agent|service|report|store|listing)\b/i;

const SHORT_AFFIRMATIVE =
  /^\s*(y(es|ep|eah|up)?|sure|ok(ay)?|go ahead|do it|buy( it)?|get it|please( do)?|sounds good|why not|let'?s (do|try|go)( it| that)?|i want it|want it)[.!\s]*$/i;

export function hasAgentPayIntent(opts: {
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
  if (PAYMENT_VERBS.test(opts.text) || SERVICE_VERBS.test(opts.text)) {
    return true;
  }
  // The offer→agree handshake: a terse agreement only counts when the
  // assistant's preceding message actually named a listed service AND a price.
  if (
    opts.lastAssistantText &&
    opts.catalogNames &&
    opts.catalogNames.length > 0 &&
    opts.text.trim().length <= 40 &&
    SHORT_AFFIRMATIVE.test(opts.text)
  ) {
    const assistant = opts.lastAssistantText;
    const namedService = opts.catalogNames.some((n) =>
      assistant.toLowerCase().includes(n.toLowerCase())
    );
    return namedService && /\$\s?\d/.test(assistant);
  }
  return false;
}
