import type { UserType } from "@/app/(auth)/auth";

// Per-hour message cap. Anonymous is IP-rate-limited separately; authed users
// are capped here. The cap is TIER-AWARE (§4b): Free keeps an acquisition cap;
// any PAID plan is effectively unlimited ("effectively unlimited on Pro").
const GUEST_HOURLY = 30;
const FREE_HOURLY = 100; // authed, no paid plan
const PAID_HOURLY = 10_000; // any paid tier → effectively unlimited

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
