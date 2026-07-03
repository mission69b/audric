import { redirect } from "next/navigation";

// Campaigns v1 (S.613) became Tasks v2 the same day — rail-native rewards
// paid as standard x402 buys (§II.16 v2). Permanent redirect for any link
// that shipped in the few hours v1 was live.
export default function CampaignsRedirect() {
  redirect("/tasks");
}
