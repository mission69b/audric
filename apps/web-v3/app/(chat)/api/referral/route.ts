import { auth } from "@/app/(auth)/auth";
import { getOrCreateReferralCode, getReferralStats } from "@/lib/db/queries";
import { REFERRAL_REWARD_USD } from "@/lib/referral/constants";

// Referral panel data — the user's shareable code + their stats. Code is
// generated lazily on first read. See SPEC_AUDRIC_REFERRALS.md.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const code = await getOrCreateReferralCode(session.user.id);
  const stats = await getReferralStats(session.user.id);
  return Response.json({
    code,
    rewardUsd: REFERRAL_REWARD_USD,
    total: stats.total,
    rewarded: stats.rewarded,
    earnedUsd: stats.earnedMicros / 1_000_000,
    rank: stats.rank,
  });
}
