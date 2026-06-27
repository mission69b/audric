import type { UserType } from "@/app/(auth)/auth";

// Per-hour message cap = an anti-abuse BURST guard (stops scripted spam within
// an hour). NOT the product cap — the DAILY caps below are the real limits and
// almost always bind first. The cap is TIER-AWARE (§4b): any PAID plan is
// effectively unlimited.
const GUEST_HOURLY = 30; // burst guard only — guests are really capped at 5/day
const FREE_HOURLY = 100; // authed, no paid plan
const PAID_HOURLY = 10_000; // any paid tier → effectively unlimited

// DAILY text-prompt caps (the real product limits; paid tiers are exempt).
// Guests get a small taste that drives the sign-in funnel; signing up unlocks 4×.
export const GUEST_DAILY_TEXT_LIMIT = 5; // not signed in → hits the sign-in nudge fast
export const FREE_DAILY_TEXT_LIMIT = 20; // authed, no paid plan

export function maxMessagesPerHour(
  userType: UserType,
  opts: { subscriptionTier?: string | null; hasCredit?: boolean } = {}
): number {
  if (userType === "guest") {
    return GUEST_HOURLY;
  }
  // Anyone who has PAID — an active subscription OR a positive credit balance
  // (PAYG top-up) — is a customer, not an acquisition-funnel free user, so the
  // hourly cap is lifted. Premium token spend is still metered by the credit gate.
  const paid =
    (opts.subscriptionTier && opts.subscriptionTier !== "free") ||
    opts.hasCredit === true;
  return paid ? PAID_HOURLY : FREE_HOURLY;
}
