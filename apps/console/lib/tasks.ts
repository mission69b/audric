// Tasks (SPEC_AGENT_COMMERCE §II.16 v2 — rail-native, founder-approved
// 2026-07-03). Display definitions for agents.t2000.ai/tasks. The ENGINE
// lives on the gateway (mpp.t2000.ai): task rewards are standard x402 buys
// from the t2000 task-runner wallet to the worker's agent — escrowed,
// receipted on Sui, reputation-accruing. Tickers on the page derive from
// the gateway's receipt-backed stats, never from numbers written here.

export const GATEWAY_BASE = "https://mpp.t2000.ai";
export const CAMPAIGN_MENTION = "@audricai";

export type TaskGroup = "sell" | "onchain" | "spread";

export const TASK_GROUPS: { id: TaskGroup; title: string; blurb: string }[] = [
  {
    id: "sell",
    title: "Sell & earn",
    blurb: "List, sell, buy — the settlement itself pays you. No submission.",
  },
  {
    id: "onchain",
    title: "On-chain",
    blurb:
      "Do the swap, claim with the tx digest — verified on-chain in one request.",
  },
  {
    id: "spread",
    title: "Spread the word",
    blurb:
      "Post on X, claim with the post URL — read and verified automatically, paid instantly.",
  },
];

export type TaskDisplay = {
  id: string;
  title: string;
  tagline: string;
  rewardUsd: number;
  /** auto = paid by the settlement hook seconds after the qualifying sale;
   *  claim = submit your swap tx digest; x-proof = submit your X post URL
   *  (read keylessly + receipt re-verified server-side — no review queue). */
  mechanic: "auto" | "claim" | "x-proof";
  group: TaskGroup;
  steps: string[];
  payNote: string;
  /** For x-proof tasks: the ready-made X post CTA. */
  xPost?: { hashtag: string; template: string };
};

// Reward amounts shown are FALLBACKS — the page renders the live values from
// the gateway's /tasks/stats (the engine's source of truth) when available.
export const TASKS: TaskDisplay[] = [
  {
    id: "first-sale",
    title: "Make your first sale on the rail",
    tagline:
      "List a real service and land your first paid, delivered sale — the rail pays you the moment it settles.",
    rewardUsd: 0.1,
    mechanic: "auto",
    group: "sell",
    steps: [
      "Install the CLI (npm i -g @t2000/cli) and run t2 init — your agent gets a free on-chain Agent ID.",
      "List a real service: wrap an API you hold a key for with t2 agent deploy, or declare a self-hosted endpoint with t2 agent service. Report-grade only — junk listings are disqualified and deny-listed.",
      "Make at least one DELIVERED sale to a buyer that isn't you (a distinct wallet).",
    ],
    payNote:
      "No submission. The settlement that completes your first sale triggers the reward automatically — the task runner buys from YOUR agent seconds later. Check `t2 agent earnings` or the Paid on-chain list below.",
  },
  {
    id: "agent-hire",
    title: "Hire an agent",
    tagline:
      "Buy any service on the store over x402 — from the CLI, your coding agent, or Try-it.",
    rewardUsd: 0.05,
    mechanic: "auto",
    group: "sell",
    steps: [
      "Get a wallet: t2 init, then t2 fund (a couple of USDC is plenty).",
      "Buy any listed service: t2 agent pay <seller address> — or paste a listing's ready-made prompt into Claude Code / Cursor.",
    ],
    payNote:
      "No submission — the reward fires automatically when your purchase settles (delivered).",
  },
  {
    id: "agent-card",
    title: "Forge your agent's card",
    tagline:
      "Buy your agent a Card Forge trading card ($0.02) — live receipt-backed stats on a shareable PNG.",
    rewardUsd: 0.02,
    mechanic: "auto",
    group: "sell",
    steps: [
      "Register your agent if you haven't: t2 init (free, gasless).",
      'Buy Card Forge for your own agent: t2 agent pay 0x7ab3d60d17f0eb9084142ca9a516b6ee5483d0cda5608f85df93c3343abe23d6 --data \'{"address":"<your agent 0x…>"}\'.',
    ],
    payNote:
      "No submission — the reward fires automatically when the card purchase settles.",
  },
  {
    id: "buy-manifest",
    title: "Buy MANIFEST on Sui",
    tagline:
      "Swap into ≥ 10 MANIFEST and claim with your tx digest — and the founder follows you back on X if you post it.",
    rewardUsd: 0.08,
    mechanic: "claim",
    group: "onchain",
    steps: [
      "Swap any asset into at least 10 MANIFEST on Sui (e.g. t2 swap, Cetus, or any DEX). A transfer-in doesn't count — the tx must show you paid another asset.",
      "Claim below (or via the API) with your wallet address + the swap's tx digest.",
      "Optional: post the swap on X tagging @audricai — the founder follows back.",
    ],
    payNote:
      "Claim-verified on-chain in one request; the reward pays out immediately when the swap checks out.",
  },
  {
    id: "buy-sui",
    title: "Buy SUI",
    tagline: "Swap into ≥ 0.5 SUI and claim with your tx digest.",
    rewardUsd: 0.08,
    mechanic: "claim",
    group: "onchain",
    steps: [
      "Swap another asset into at least 0.5 SUI (a transfer-in doesn't count — the tx must show a paid leg).",
      "Claim below (or via the API) with your wallet address + the swap's tx digest.",
    ],
    payNote:
      "Claim-verified on-chain in one request; pays out immediately when the swap checks out.",
  },
  {
    id: "verify-confidential",
    title: "Verify a confidential receipt",
    tagline:
      "Run a confidential prompt, prove it trustlessly with t2 verify, and post the receipt on X.",
    rewardUsd: 0.25,
    mechanic: "x-proof",
    group: "spread",
    steps: [
      'Run any prompt through Confidential mode on audric.ai, or via the API: t2 chat --model phala/gpt-oss-120b "…".',
      "Run t2 verify rcpt-… — it checks the TDX quote, TEE-signed receipt, and Sui anchor on YOUR machine.",
      `Post on X (template below): it must mention ${CAMPAIGN_MENTION} and include the receipt id + your Sui wallet address.`,
      "Claim below with your wallet + the post URL.",
    ],
    payNote:
      "Claim-verified in one request — the gateway reads your public post and re-verifies the receipt against its Sui anchor. No review queue.",
    xPost: {
      hashtag: "#t2000Verified",
      template:
        "I just verified a confidential AI response from {mention} — genuine TDX enclave, TEE-signed receipt, anchored on Sui, all checked on MY machine with t2 verify.\n\nrcpt: <your receipt id>\nwallet: <your Sui address>\n\n{hashtag}",
    },
  },
  {
    id: "share-your-agent",
    title: "Share your agent",
    tagline:
      "Post your listing on X — your agent's page IS the proof, and the rail pays you for the signal boost.",
    rewardUsd: 0.1,
    mechanic: "x-proof",
    group: "spread",
    steps: [
      "Register + list your agent if you haven't (t2 init — free, gasless; see /sell).",
      `Post on X (template below): it must mention ${CAMPAIGN_MENTION} and include YOUR listing URL — agents.t2000.ai/<your full wallet address>.`,
      "Claim below with your wallet + the post URL.",
    ],
    payNote:
      "Claim-verified in one request — the gateway reads your public post, checks the listing URL matches your registered agent, and pays instantly. One reward per X account, per post, per wallet.",
    xPost: {
      hashtag: "#t2000Agents",
      template:
        "My agent is live on the {mention} agent store — selling <what it does> for USDC per call, receipts on Sui, refund-on-failure built in.\n\nagents.t2000.ai/<your full wallet address>\n\n{hashtag}",
    },
  },
];

export function xPostText(t: TaskDisplay): string {
  if (!t.xPost) {
    return "";
  }
  return t.xPost.template
    .replaceAll("{mention}", CAMPAIGN_MENTION)
    .replaceAll("{hashtag}", t.xPost.hashtag);
}

export function intentUrl(t: TaskDisplay): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(xPostText(t))}`;
}

export type TaskStats = {
  active: boolean;
  launchedAt: string;
  tasks: {
    id: string;
    rewardNetUsd: number;
    budgetUsd: number;
    spentUsd: number;
    paidCount: number;
    status: "live" | "paused";
    payouts: { wallet: string; netUsd: number; at: string; tx: string }[];
  }[];
};

export async function fetchTaskStats(): Promise<TaskStats | null> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/tasks/stats`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as TaskStats;
  } catch {
    return null;
  }
}
