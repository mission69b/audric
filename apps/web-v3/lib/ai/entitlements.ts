// Message-volume caps for SIGNED-IN users only. Anonymous users have no cookie
// (auth() → null; v3 mints no "guest" session — see app/(auth)/auth.ts), so they
// are gated entirely by the IP rate-limiter in `lib/ratelimit.ts` — that's the
// try-before-signup wall + the sign-in-nudge trigger. Don't add a "guest" branch
// here; it would be dead code.
//
// Two signed-in states:
//  • free  → an acquisition cap (FREE_DAILY_TEXT_LIMIT + a generous hourly burst guard)
//  • paid  → effectively unlimited (any active sub OR positive credit balance)
const FREE_HOURLY = 100; // anti-burst guard (the daily cap is the real limit)
const PAID_HOURLY = 10_000; // any paid tier → effectively unlimited

/** The real product cap for signed-in free users: 20 text prompts/day. */
export const FREE_DAILY_TEXT_LIMIT = 20;

export function maxMessagesPerHour(opts: {
  subscriptionTier?: string | null;
  hasCredit?: boolean;
}): number {
  const paid =
    (opts.subscriptionTier && opts.subscriptionTier !== "free") ||
    opts.hasCredit === true;
  return paid ? PAID_HOURLY : FREE_HOURLY;
}
