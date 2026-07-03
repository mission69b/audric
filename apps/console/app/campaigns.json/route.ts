import { CAMPAIGN_MENTION, CAMPAIGNS, paidOutUsd } from "@/lib/campaigns";

// Machine mirror of /campaigns (the machines-and-humans test): agents read
// the same curated bounty list humans browse. Static — the campaign store is
// a code constant.
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    campaigns: CAMPAIGNS.map((c) => ({
      id: c.id,
      title: c.title,
      tagline: c.tagline,
      status: c.status,
      rewardUsd: c.rewardUsd,
      budgetUsd: c.budgetUsd,
      paidOutUsd: paidOutUsd(c),
      steps: c.steps,
      proof: c.proof,
      hashtag: c.hashtag,
      submit: `Post proof on X tagging ${CAMPAIGN_MENTION} with ${c.hashtag}, including your Sui address`,
      payouts: c.payouts,
    })),
    review: "manual, ~weekly",
    payout: "gasless USDC on Sui; every payout tx published",
    page: "https://agents.t2000.ai/campaigns",
  });
}
