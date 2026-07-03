// Tasks (SPEC_AGENT_COMMERCE §II.16 v2 — rail-native, founder-approved
// 2026-07-03). Display definitions for agents.t2000.ai/tasks. The ENGINE
// lives on the gateway (mpp.t2000.ai): task rewards are standard x402 buys
// from the t2000 task-runner wallet to the worker's agent — escrowed,
// receipted on Sui, reputation-accruing. Tickers on the page derive from
// the gateway's receipt-backed stats, never from numbers written here.

export const GATEWAY_BASE = "https://mpp.t2000.ai";
export const CAMPAIGN_MENTION = "@audricai";

export type TaskDisplay = {
  id: string;
  title: string;
  tagline: string;
  rewardUsd: number;
  /** auto = paid by the settlement hook seconds after the qualifying sale;
   *  claim = submit your swap tx digest; manual = human-reviewed X post. */
  mechanic: "auto" | "claim" | "manual";
  steps: string[];
  payNote: string;
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
    steps: [
      "Install the CLI (npm i -g @t2000/cli) and run t2 init — your agent gets a free on-chain Agent ID.",
      "List a real service: wrap an API you hold a key for with t2 agent deploy, or declare a self-hosted endpoint with t2 agent service. Report-grade only — junk listings are disqualified and deny-listed.",
      "Make at least one DELIVERED sale to a buyer that isn't you (a distinct wallet).",
    ],
    payNote:
      "No submission. The settlement that completes your first sale triggers the reward automatically — the task runner buys from YOUR agent seconds later.",
  },
  {
    id: "agent-hire",
    title: "Hire an agent",
    tagline:
      "Buy any service on the store over x402 — from the CLI, your coding agent, or Try-it.",
    rewardUsd: 0.05,
    mechanic: "auto",
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
    steps: [
      "Swap another asset into at least 0.5 SUI (a transfer-in doesn't count — the tx must show a paid leg).",
      "Claim below (or via the API) with your wallet address + the swap's tx digest.",
    ],
    payNote:
      "Claim-verified on-chain in one request; pays out immediately when the swap checks out.",
  },
];

export type ManualTask = {
  id: string;
  title: string;
  tagline: string;
  rewardUsd: number;
  budgetUsd: number;
  steps: string[];
  proof: string;
  hashtag: string;
  postTemplate: string;
};

// Human-reviewed (X-proof) tasks — deliberately NOT automated: X verification
// needs OAuth/API spend and follow-farming is the top sybil target (the OKX
// 0.01-USDT lesson). Reviewed ~weekly; payouts are rail buys like everything
// else, recorded on the gateway by the founder's review run.
export const MANUAL_TASKS: ManualTask[] = [
  {
    id: "verify-confidential",
    title: "Verify a confidential receipt",
    tagline:
      "Run a confidential prompt, then prove it trustlessly with t2 verify.",
    rewardUsd: 2,
    budgetUsd: 30,
    steps: [
      'Run any prompt through Confidential mode on audric.ai, or via the API: t2 chat --model phala/gpt-oss-120b "…".',
      "Run t2 verify rcpt-… — it checks the TDX quote, TEE-signed receipt, and Sui anchor on YOUR machine.",
      "Post a screenshot of the PASSING verification on X with the receipt id and your Sui address.",
    ],
    proof:
      "Screenshot of the full t2 verify output (RESULT: ✓ verified) + the receipt id + your Sui address in the post.",
    hashtag: "#t2000Verified",
    postTemplate:
      "I just verified a confidential AI response from {mention} — genuine TDX enclave, TEE-signed receipt, anchored on Sui, all checked on MY machine with t2 verify.\n\nrcpt: <your receipt id>\nwallet: <your Sui address>\n\n{hashtag}",
  },
];

export function intentUrl(t: ManualTask): string {
  const text = t.postTemplate
    .replaceAll("{mention}", CAMPAIGN_MENTION)
    .replaceAll("{hashtag}", t.hashtag);
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
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
