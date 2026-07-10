// The Hub skills feed (SPEC_HUB_V1 §3.1) — one entry per agent skill. Every
// skillUrl is LIVE, served markdown an agent reads and follows (t2000.ai
// serves the t2000-skills repo). Onboarding is one paste:
//   "Read <skillUrl> and follow the instructions."
// Third-party dapp skills join by PR — the feed is the curation point; only
// skills that have been read + smoke-tested get merged.

export interface SkillEntry {
  /** The dapp/protocol this skill teaches. */
  dapp: string;
  description: string;
  name: string;
  /** Entries that need a funded wallet first (most money skills do). */
  needsWallet?: boolean;
  /** Live markdown an agent can read + follow. */
  skillUrl: string;
  slug: string;
  tags: string[];
}

export const SKILLS_FEED: SkillEntry[] = [
  {
    slug: "t2000-setup",
    name: "Wallet setup",
    dapp: "t2000",
    description:
      "Bootstrap the Agent Wallet: local keypair, free on-chain Agent ID, spending limits, MCP wiring. The entry point every other skill assumes.",
    tags: ["wallet", "identity", "setup"],
    skillUrl: "https://t2000.ai/skills/t2000-setup",
  },
  {
    slug: "t2000-send",
    name: "Send stablecoins",
    dapp: "Sui",
    description:
      "Send USDC / USDsui / SUI to any address, SuiNS name, or @handle — stablecoin sends are gasless (no SUI needed).",
    tags: ["payments", "gasless", "suins"],
    skillUrl: "https://t2000.ai/skills/t2000-send",
    needsWallet: true,
  },
  {
    slug: "t2000-swap",
    name: "Swap any Sui token",
    dapp: "Cetus",
    description:
      "Best-route swaps through the Cetus Aggregator across 20+ Sui DEXs — quotes, slippage control, and the swap-needs-SUI-for-gas gotcha.",
    tags: ["defi", "swap", "cetus"],
    skillUrl: "https://t2000.ai/skills/t2000-swap",
    needsWallet: true,
  },
  {
    slug: "t2000-pay",
    name: "Pay APIs per call",
    dapp: "t2000 rail",
    description:
      "Pay any x402-protected API in USDC — LLMs, search, image gen, data feeds. Handles the 402 challenge → pay → retry loop automatically.",
    tags: ["x402", "payments", "apis"],
    skillUrl: "https://t2000.ai/skills/t2000-pay",
    needsWallet: true,
  },
  {
    slug: "t2000-services",
    name: "Discover paid APIs",
    dapp: "t2000 rail",
    description:
      "Browse the x402 service catalog (AI models, search, data, mail, TTS, code exec) with live prices — free, before paying anything.",
    tags: ["x402", "discovery"],
    skillUrl: "https://t2000.ai/skills/t2000-services",
  },
  {
    slug: "t2000-hire",
    name: "Pay other agents",
    dapp: "t2000 rail",
    description:
      "Buy services from registered agents — escrowed, pay-on-delivery, auto-refund — and sell your own capability per call.",
    tags: ["commerce", "x402", "escrow"],
    skillUrl: "https://t2000.ai/skills/t2000-hire",
    needsWallet: true,
  },
  {
    slug: "t2000-receive",
    name: "Request payments",
    dapp: "t2000",
    description:
      "Share the wallet address, render a QR, or emit a sui:pay payment URI so humans and agents can pay this wallet.",
    tags: ["payments", "receive"],
    skillUrl: "https://t2000.ai/skills/t2000-receive",
  },
  {
    slug: "t2000-check-balance",
    name: "Read balances",
    dapp: "Sui",
    description:
      "Inspect USDC / USDsui / SUI holdings and USD totals before any write — the pre-flight every money loop should run.",
    tags: ["wallet", "reads"],
    skillUrl: "https://t2000.ai/skills/t2000-check-balance",
  },
  {
    slug: "t2000-verify",
    name: "Verify confidential AI",
    dapp: "t2000 Private API",
    description:
      "Trustlessly verify a confidential (GPU-TEE) inference receipt against its on-chain Sui anchor — fails closed on any mismatch.",
    tags: ["confidential", "verify", "receipts"],
    skillUrl: "https://t2000.ai/skills/t2000-verify",
  },
  {
    slug: "t2000-mcp",
    name: "Wire up MCP",
    dapp: "t2000",
    description:
      "Connect the wallet to Claude Desktop, Cursor, Windsurf, or any MCP client — 15 tools plus one prompt per skill.",
    tags: ["mcp", "setup"],
    skillUrl: "https://t2000.ai/skills/t2000-mcp",
  },
];

/** The one-paste onboarding line for a skill card. */
export function skillPrompt(entry: SkillEntry): string {
  return `Read ${entry.skillUrl} and follow the instructions.`;
}
