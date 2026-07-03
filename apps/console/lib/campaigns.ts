// Campaigns (SPEC_AGENT_COMMERCE §II.16 — founder-greenlit 2026-07-03).
//
// Curated growth bounties posted ONLY by t2000/audric/funkii — marketing
// spend wearing a product surface, NOT an open task hall. This file IS the
// campaign store: static + code-reviewed (same trust model as the Audric
// seller allowlist). Submissions arrive as X posts (prefilled intent links);
// review is MANUAL; payouts are gasless USDC sends on Sui appended to
// `payouts` below as they happen — the page's "paid X of $Y" ticker derives
// from those receipt rows, never a self-reported number.
//
// No posting UI, no arbitration, no acceptance flow — we are the only poster
// and the judge. Budgets here are caps, not obligations.

/** The X account campaign posts should tag (swap in one place if needed). */
export const CAMPAIGN_MENTION = "@audricai";

export type CampaignPayout = {
  /** Sui tx digest of the USDC payout — the receipt. */
  tx: string;
  amountUsd: number;
  /** ISO date of the payout. */
  at: string;
};

export type Campaign = {
  id: string;
  title: string;
  tagline: string;
  /** Reward per accepted submission, USD (paid in USDC on Sui). */
  rewardUsd: number;
  /** Total budget cap, USD. Campaign auto-pauses when spent. */
  budgetUsd: number;
  status: "live" | "paused" | "completed";
  /** What to do, in order. */
  steps: string[];
  /** What counts as proof (reviewed manually). */
  proof: string;
  /** Prefilled X post template ({mention} is substituted). */
  postTemplate: string;
  hashtag: string;
  /** Appended manually as accepted submissions are paid out. */
  payouts: CampaignPayout[];
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "first-sale",
    title: "Make your first sale on the rail",
    tagline:
      "List a real service and get your first paid, delivered sale — the receipt is the proof.",
    rewardUsd: 10,
    budgetUsd: 200,
    status: "live",
    steps: [
      "Install the CLI (npm i -g @t2000/cli) and run t2 init — your agent gets a free on-chain Agent ID.",
      "List a real service: wrap an API you hold a key for with t2 agent deploy, or declare your self-hosted endpoint with t2 agent service. Report-grade services only — raw proxies and junk listings don't qualify.",
      "Make at least one DELIVERED sale to a buyer that isn't you (a distinct wallet).",
      "Post your listing link + the settlement tx on X.",
    ],
    proof:
      "Your listing URL (agents.t2000.ai/0x…) + the Suiscan settlement tx + your X post. The buyer wallet must be distinct from your seller wallet — wash sales disqualify.",
    postTemplate:
      "Just made my first sale on the {mention} agent rail — my agent sells a real service, paid in USDC, settled on Sui with an on-chain receipt.\n\nListing: <your listing URL>\nReceipt: <suiscan tx URL>\n\n{hashtag}",
    hashtag: "#t2000FirstSale",
    payouts: [],
  },
  {
    id: "verify-confidential",
    title: "Verify a confidential receipt",
    tagline:
      "Run a confidential prompt, then prove it trustlessly with t2 verify.",
    rewardUsd: 2,
    budgetUsd: 50,
    status: "live",
    steps: [
      'Run any prompt through Confidential mode on audric.ai, or via the API: t2 chat --model phala/gpt-oss-120b "…".',
      "Take the receipt id (rcpt-…) and run t2 verify rcpt-… — it checks the TDX quote, the TEE-signed receipt, and the Sui anchor client-side.",
      "Post a screenshot of the PASSING verification on X with the receipt id.",
    ],
    proof:
      "Screenshot of the full t2 verify output (RESULT: ✓ verified) + the receipt id in the post.",
    postTemplate:
      "I just verified a confidential AI response from {mention} — genuine TDX enclave, TEE-signed receipt, anchored on Sui, all checked on MY machine with t2 verify.\n\nrcpt: <your receipt id>\n\n{hashtag}",
    hashtag: "#t2000Verified",
    payouts: [],
  },
  {
    id: "agent-hire",
    title: "Hire an agent from your agent",
    tagline:
      "Have Claude Code, Cursor, or any agent buy a store service over x402 — machine pays machine.",
    rewardUsd: 3,
    budgetUsd: 60,
    status: "live",
    steps: [
      "Give your agent the CLI: npm i -g @t2000/cli, t2 init, then t2 fund (a couple of USDC is plenty).",
      "Pick any service on agents.t2000.ai and have your agent buy it: t2 agent pay <seller address> — or paste the listing's ready-made prompt.",
      "Post the settlement tx + one line on what your agent did with the result.",
    ],
    proof:
      "The Suiscan settlement tx (your buyer wallet → delivered) + your X post describing the result.",
    postTemplate:
      "My agent just hired another agent on the {mention} rail — paid USDC over x402, service delivered in the same round trip, settled on Sui.\n\nReceipt: <suiscan tx URL>\n\n{hashtag}",
    hashtag: "#t2000Hired",
    payouts: [],
  },
  {
    id: "agent-card",
    title: "Post your agent's card",
    tagline:
      "Buy your agent a Card Forge trading card ($0.02) and share it — live, receipt-backed stats on the PNG.",
    rewardUsd: 2,
    budgetUsd: 40,
    status: "live",
    steps: [
      "Register your agent if you haven't: t2 init (free, gasless).",
      'Buy Card Forge for your own agent: t2 agent pay 0x7ab3d60d17f0eb9084142ca9a516b6ee5483d0cda5608f85df93c3343abe23d6 --data \'{"address":"<your agent 0x…>"}\'.',
      "Post the card PNG on X.",
    ],
    proof: "The card image in your X post + your agent's listing URL.",
    postTemplate:
      "My agent has a trading card now — live on-chain stats, generated by another agent on the {mention} rail for $0.02.\n\n{hashtag}",
    hashtag: "#AgentCard",
    payouts: [],
  },
];

export function paidOutUsd(c: Campaign): number {
  return c.payouts.reduce((sum, p) => sum + p.amountUsd, 0);
}

/** The prefilled X intent URL for a campaign's proof post. */
export function intentUrl(c: Campaign): string {
  const text = c.postTemplate
    .replaceAll("{mention}", CAMPAIGN_MENTION)
    .replaceAll("{hashtag}", c.hashtag);
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
